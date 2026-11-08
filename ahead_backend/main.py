import json
import os
import queue
import threading

import uuid
from datetime import date

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

import agent
import eyes
import ledger
import tools
import voice

app = FastAPI(title="Ahead")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


class Ask(BaseModel):
    q: str


@app.post("/ask")
def ask(body: Ask):
    return agent.run(body.q[:500])


@app.get("/ask/stream")
def ask_stream(q: str):
    """Server-Sent Events: step events while the agent works, then the answer."""
    events: queue.Queue = queue.Queue()

    def work():
        try:
            agent.run(q[:500], emit=events.put)
        except Exception as e:  # never leave the client hanging
            events.put({"type": "error", "message": "Something went wrong. Try again.", "detail": type(e).__name__})
        events.put(None)

    threading.Thread(target=work, daemon=True).start()

    def gen():
        while (e := events.get()) is not None:
            yield f"data: {json.dumps(e, default=str)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ---------------- Home / data ----------------

LOCK = threading.Lock()  # one money write at a time
UNDO: dict[str, list] = {}  # undo_id -> undo steps


def _money_saved():
    cancelled = [b for b in ledger.load()["bills"] if b["status"] == "cancelled"]
    m = round(sum(b["amount"] for b in cancelled), 2)
    return {"monthly": m, "yearly": round(m * 12, 2), "count": len(cancelled),
            "why": "What you no longer pay for charges you cancelled in Ahead."}


def _open_alerts():
    return [a for a in ledger.load()["alerts"] if not a.get("dismissed")]


@app.get("/summary")
def summary():
    h, f = tools.health_score(), tools.forecast()
    alerts = _open_alerts()
    return {"name": "Maya", "today": ledger.load()["today"].isoformat(),
            "safe_until": f["safe_until"], "safe_why": f["why"], "lowest": f["lowest"],
            "score": h["score"], "indicators": h["indicators"], "balances": tools.get_snapshot()["balances"], "card_limit": ledger.load()["card_limit"],
            "money_saved": _money_saved(), "top_alert": alerts[0] if alerts else None, "alert_count": len(alerts)}


@app.get("/overview")
def overview():
    """Home tiles: budget pace, upcoming debt dues, card breakdown, investments."""
    return {"budget": tools.budget_pace(), "debt": tools.upcoming_dues(), "card": tools.card_overview(),
            "investments": tools.investments_overview()}


@app.get("/forecast")
def forecast(days: int = 60):
    return tools.forecast(days=max(7, min(days, 90)))


@app.get("/brief")
def brief():
    return tools.daily_brief()


@app.get("/alerts")
def alerts():
    return {"alerts": _open_alerts()}


class WhatIf(BaseModel):
    start_delta: float = 0
    variable_scale: float = 1.0
    no_income: bool = False


@app.post("/what-if")
def what_if(body: WhatIf):
    return tools.what_if(change={"start_delta": body.start_delta, "variable_scale": max(0.0, body.variable_scale),
                                 "no_income": body.no_income})


class Purchase(BaseModel):
    amount: float


@app.post("/purchase-check")
def purchase_check(body: Purchase):
    if not 0 < body.amount <= 100000:
        raise HTTPException(400, "amount must be positive")
    return tools.purchase_impact(amount=body.amount)


@app.get("/leaks")
def leaks():
    cancelled = [{"bill_id": b["id"], "merchant": b["payee"], "amount": b["amount"], "yearly": round(b["amount"] * 12, 2)}
                 for b in ledger.load()["bills"] if b["status"] == "cancelled"]
    return tools.find_leaks() | {"money_saved": _money_saved(), "cancelled": cancelled}


@app.get("/budget")
def budget():
    return {"budget": tools.build_budget(), "pace": tools.budget_pace(), "debt": tools.debt_plan()}


class BudgetGoal(BaseModel):
    monthly_saving: float = 0


@app.post("/budget/build")
def budget_build(body: BudgetGoal):
    return tools.build_budget(goal={"monthly_saving": max(0.0, body.monthly_saving)})


@app.get("/trace/{trace_id}")
def trace(trace_id: str):
    t = ledger.load()["traces"].get(trace_id)
    if not t:
        raise HTTPException(404, "trace not found")
    return t


# ---------------- Actions (user-approved only) ----------------

def _run_action(action):
    with LOCK:
        r = agent.execute(action)
    if not r["ok"]:
        raise HTTPException(400, r.get("error") or "could not complete")
    uid = uuid.uuid4().hex[:10]
    UNDO[uid] = r["undo"]
    return r | {"undo_id": uid, "money_saved": _money_saved()}


class Approve(BaseModel):
    alert_id: str | None = None
    fix_id: str | None = None
    action: dict | None = None  # from chat/voice: the action the agent proposed and the user said yes to


@app.post("/approve")
def approve(body: Approve):
    if body.alert_id:
        alert = next((a for a in _open_alerts() if a["id"] == body.alert_id), None)
        fix = alert and next((f for f in alert["fixes"] if f["id"] == body.fix_id), None)
        if not fix:
            raise HTTPException(404, "alert or fix not found")
        return _run_action(fix["action"])
    if body.action:
        return _run_action(body.action)
    raise HTTPException(400, "send alert_id + fix_id, or action")


class Undo(BaseModel):
    undo_id: str


@app.post("/undo")
def undo(body: Undo):
    steps = UNDO.pop(body.undo_id, None)
    if steps is None:
        raise HTTPException(404, "nothing to undo")
    with LOCK:
        r = agent.undo_all(steps)
        agent.watch("undo")
    return r | {"money_saved": _money_saved()}


class Cancel(BaseModel):
    bill_id: str


@app.post("/leaks/cancel")
def leaks_cancel(body: Cancel):
    bill = next((b for b in ledger.load()["bills"] if b["id"] == body.bill_id), None)
    if not bill:
        raise HTTPException(404, "bill not found")
    r = _run_action({"kind": "cancel_bill", "bill_id": body.bill_id})
    return r | {"email": tools.draft_message("cancel", merchant=bill["payee"])["text"]}


@app.post("/leaks/restore")
def leaks_restore(body: Cancel):
    """Bring back a charge cancelled earlier (same as Undo, any time later)."""
    bill = next((b for b in ledger.load()["bills"] if b["id"] == body.bill_id and b["status"] == "cancelled"), None)
    if not bill:
        raise HTTPException(404, "cancelled charge not found")
    with LOCK:
        r = tools.create_bill(bill["account"], bill["payee"], bill["amount"], bill["day"])
        agent.watch("restore")
    if not r.get("ok"):
        raise HTTPException(400, r.get("error") or "could not restore")
    return {"ok": True, "money_saved": _money_saved()}


@app.post("/simulate-week")
def simulate_week():
    with LOCK:
        alerts = agent.simulate_week()
    return {"alerts": [a for a in alerts if not a.get("dismissed")], "summary": summary()}


@app.post("/reset")
def reset():
    """Full reset (Nessie + Tiger) when configured; always resets in-memory state."""
    with LOCK:
        full = False
        if os.getenv("NESSIE_API_KEY"):
            import seed
            import sync
            try:
                seed.wipe()
                seed.seed()
                full = True
            except Exception as e:
                print(f"Nessie reseed failed ({type(e).__name__}); using fallback data")
            if os.getenv("DATABASE_URL"):
                sync.write_ledger(sync.load_data())
        ledger.reset()
        UNDO.clear()
    return {"ok": True, "full": full, "summary": summary()}


# ---------------- Coming in later steps ----------------

@app.get("/voice/status")
def voice_status():
    return voice.status()


@app.post("/voice")
async def voice_in(audio: UploadFile):
    """Speech -> text with Nemotron ASR. 503 tells the browser to use its own speech recognition."""
    data = await audio.read()
    if not data or len(data) > 5_000_000:
        raise HTTPException(400, "send 0-5 MB of audio")
    try:
        text = await run_in_threadpool(voice.transcribe, data)
    except voice.VoiceUnavailable as e:
        raise HTTPException(503, f"voice unavailable: {e}")
    return {"transcript": text}


class Speak(BaseModel):
    text: str


@app.post("/tts")
async def tts(body: Speak):
    """Text -> speech with Nemotron TTS (WAV). 503 tells the browser to use speechSynthesis."""
    try:
        wav = await run_in_threadpool(voice.speak, body.text[:600])
    except voice.VoiceUnavailable as e:
        raise HTTPException(503, f"voice unavailable: {e}")
    return Response(wav, media_type="audio/wav")


@app.post("/upload")
async def upload(file: UploadFile | None = None, sample: bool = False):
    """Photo/PDF -> Gemini JSON -> validated proposal with a before/after preview. Nothing is saved until /approve."""
    today = ledger.load()["today"]
    if sample:
        raw = eyes.sample(today)
    else:
        if not file or file.content_type not in eyes.TYPES:
            raise HTTPException(400, "send a PNG, JPEG, WEBP, HEIC or PDF")
        data = await file.read()
        if not data or len(data) > 8_000_000:
            raise HTTPException(400, "send a file up to 8 MB")
        try:
            raw = await run_in_threadpool(eyes.read, data, file.content_type, today)
        except eyes.EyesUnavailable as e:
            raise HTTPException(503, f"reading files is unavailable right now ({e}). Try the sample.")
    out = eyes.normalize(raw, today)
    if not out["ok"]:
        return out
    if out["type"] == "price":  # "Should I buy this?"
        return out | {"impact": tools.purchase_impact(amount=out["amount"])}
    now = agent.summary()
    after = agent._preview(out["action"])
    return out | {"before": {"score": now["score"], "safe_until": now["safe_until"]},
                  "after": {"score": after["score"], "safe_until": after["safe_until"]}}


# ---------------- Autopilot rules ----------------

@app.get("/rules")
def rules():
    return {"rules": ledger.load()["rules"]}


class RuleId(BaseModel):
    id: str


@app.post("/rules/delete")
def rules_delete(body: RuleId):
    if not any(r["id"] == body.id for r in ledger.load()["rules"]):
        raise HTTPException(404, "rule not found")
    with LOCK:
        ledger.delete_rule(body.id)
        agent.watch("rule_removed")
    return {"ok": True, "summary": summary()}
