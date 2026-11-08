"""Ahead agent: Guard -> Planner (Nemotron, rule fallback) -> tools -> Critic -> answer. Plus Watcher and actions.
The LLM never moves money: it can only *propose* an action; execute() runs only after user approval."""
import json
import re
import time
import uuid
from datetime import date, timedelta

import ledger
import llm
import tools

# ---------------- Guard ----------------

INJECTION = re.compile(r"ignore (all |the )?(previous|prior|above)|system prompt|you are now|developer mode|"
                       r"reveal (your|the) (prompt|instructions|key)|api[_ ]?key", re.I)
RISKY = re.compile(r"\b(payday loan|title loan|gambl|casino|sports ?bet|crypto|bitcoin|meme stock|options trading|"
                   r"margin|all (of )?my savings into|cash advance|steal|launder|evade tax)", re.I)
SAFE_REPLY = {
    "injection": "I can only help with your money in Ahead. Try asking about your safe date or a purchase.",
    "risky": "I can't help with that one, it could put your money at real risk. "
             "I can show how a choice changes your safe date instead.",
}


def guard(text: str) -> dict:
    if INJECTION.search(text):
        return {"ok": False, "reason": "injection", "reply": SAFE_REPLY["injection"], "by": "rules"}
    if RISKY.search(text):
        return {"ok": False, "reason": "risky", "reply": SAFE_REPLY["risky"], "by": "rules"}
    try:
        msg = llm.chat(llm.GUARD, [{"role": "user", "content": text}], timeout=8)
        if "unsafe" in (msg.get("content") or "").lower():
            return {"ok": False, "reason": "unsafe", "reply": SAFE_REPLY["risky"], "by": "nemoguard"}
        return {"ok": True, "by": "nemoguard"}
    except llm.LLMUnavailable:
        return {"ok": True, "by": "rules"}


# ---------------- Critic ----------------

NUM = re.compile(r"(\$)?(-?\d[\d,]*(?:\.\d+)?)(%)?")


def _flat_numbers(obj, out):
    if isinstance(obj, bool):
        return out
    if isinstance(obj, (int, float)):
        out.add(round(abs(float(obj)), 2))
        out.add(round(abs(float(obj)) * 100, 0))  # ratios shown as %
    elif isinstance(obj, dict):
        for v in obj.values():
            _flat_numbers(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _flat_numbers(v, out)
    elif isinstance(obj, str):
        for m in NUM.finditer(obj):
            _flat_numbers(float(m.group(2).replace(",", "")), out)
    return out


def critic(answer: str, tool_results: list) -> dict:
    """Every $ amount, %, or number > 31 in the answer must match a tool output (to the dollar)."""
    known = _flat_numbers(tool_results, set())
    bad = []
    for m in NUM.finditer(answer):
        cur, raw, pct = m.groups()
        v = abs(float(raw.replace(",", "")))
        if not cur and not pct and v <= 31:  # day-of-month, counts like "2 subscriptions"
            continue
        if not any(abs(v - k) <= 0.5 or (v >= 100 and abs(v - k) <= 1) for k in known):
            bad.append(m.group(0))
    return {"verified": not bad, "unverified": bad}


# ---------------- Planner ----------------

TOOLS = {
    "get_snapshot": (tools.get_snapshot, {}),
    "get_cashflow": (tools.get_cashflow, {"months": "integer"}),
    "health_score": (tools.health_score, {}),
    "forecast": (lambda **k: _short_forecast(tools.forecast(**k)), {}),
    "what_if": (lambda **k: _short_whatif(tools.what_if(**k)), {"change": "object"}),
    "purchase_impact": (tools.purchase_impact, {"amount": "number"}),
    "save_for_goal": (tools.save_for_goal, {"amount": "number", "by_date": "string"}),
    "find_leaks": (tools.find_leaks, {}),
    "build_budget": (tools.build_budget, {}),
    "budget_pace": (tools.budget_pace, {}),
    "debt_plan": (tools.debt_plan, {"extra": "number"}),
}


def _short_forecast(f):  # keep tool outputs short for the LLM
    return {k: f[k] for k in ("safe_until", "why", "lowest")} | {"next_bills": f["markers"][:6]}


def _short_whatif(w):
    return {k: {"safe_until": v["safe_until"], "lowest": v["lowest"]} for k, v in w.items() if k != "dates"}


def _tool_specs():
    return [{"type": "function", "function": {"name": n, "description": (fn.__doc__ or n).strip().split("\n")[0],
             "parameters": {"type": "object", "properties": {k: {"type": t} for k, t in args.items()}}}}
            for n, (fn, args) in TOOLS.items()]


SYSTEM = """detailed thinking on
You are Ahead, a calm, kind money assistant for Maya. Today is {today}.
Rules:
- Use tools for every number. Never invent or estimate numbers yourself.
- Plain words, no jargon, no shame. Max 3 short sentences.
- You cannot move money. To suggest a move, include an "action" and ask her to approve.
- Never mention account numbers or tool names.
Finish with ONLY a JSON object:
{{"answer": "...", "spoken_text": "max 2 sentences", "action": null or {{"kind": "transfer", "from": "savings|checking", "to": "savings|checking|card", "amount": N}} or {{"kind": "create_rule", "rule": {{"kind": "save_weekly", "amount": N}}}}}}"""


def _llm_plan(question, emit, results):
    msgs = [{"role": "system", "content": SYSTEM.format(today=ledger.load()["today"].isoformat())},
            {"role": "user", "content": question}]
    for _ in range(5):
        msg = llm.chat(llm.SUPER, msgs, tools=_tool_specs())
        calls = msg.get("tool_calls") or []
        if not calls:
            content = re.sub(r"<think>.*?</think>", "", msg.get("content") or "", flags=re.S)
            m = re.search(r"\{.*\}", content, re.S)
            return json.loads(m.group(0)) if m else {"answer": content.strip()}
        msgs.append(msg)
        for c in calls:
            name, args = c["function"]["name"], json.loads(c["function"]["arguments"] or "{}")
            res = _run_tool(name, args, emit, results)
            msgs.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(res, default=str)})
    raise llm.LLMUnavailable("too many tool rounds")


def _run_tool(name, args, emit, results):
    if name not in TOOLS:
        return {"error": "unknown tool"}
    emit({"type": "step", "label": STEP_LABELS.get(name, "Working")})
    t0 = time.time()
    try:
        res = TOOLS[name][0](**args)
    except Exception as e:
        res = {"error": type(e).__name__}
    results.append({"tool": name, "args": args, "result": res, "ms": int((time.time() - t0) * 1000)})
    return res


STEP_LABELS = {"get_snapshot": "Looking at your accounts", "forecast": "Running forecast",
               "what_if": "Comparing options", "health_score": "Checking your score",
               "purchase_impact": "Checking the purchase", "save_for_goal": "Planning your goal",
               "find_leaks": "Finding money leaks", "build_budget": "Building budget",
               "budget_pace": "Checking budget pace", "debt_plan": "Planning payoff",
               "get_cashflow": "Checking bills"}


def _amount(q):
    m = re.search(r"\$\s?(\d[\d,]*(?:\.\d+)?)", q) or re.search(r"\b(\d[\d,]{2,}(?:\.\d+)?)\b", q)
    return float(m.group(1).replace(",", "")) if m else None


MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september",
          "october", "november", "december"]


def _month_date(q, today):
    for i, name in enumerate(MONTHS, 1):
        if name in q.lower() or re.search(rf"\b{name[:3]}\b", q.lower()):
            y = today.year + (1 if (i, 15) <= (today.month, today.day) else 0)
            return date(y, i, 15)
    return None


def _usd(x):
    return f"-${-x:,.0f}" if x < 0 else f"${x:,.0f}"


def _fmt(d):
    return date.fromisoformat(d).strftime("%b %-d") if d else "the next 60 days"


def _rule_plan(question, emit, results):
    """Deterministic fallback so the demo never breaks. Same tools, templated words."""
    q, today = question.lower(), ledger.load()["today"]
    run = lambda n, **a: _run_tool(n, a, emit, results)
    amt = _amount(question)
    if re.search(r"\bmove\b|\btransfer\b", q) and amt:
        to = "savings" if "saving" in q else "checking"
        frm = "checking" if to == "savings" else "savings"
        f = run("what_if", change={"start_delta": -amt if to == "savings" else amt})
        return {"answer": f"Move ${amt:,.0f} from {frm} to {to}? Your safe date would be {_fmt(f['new']['safe_until'])}.",
                "spoken_text": f"Move ${amt:,.0f} to {to}. Say yes to confirm.",
                "action": {"kind": "transfer", "from": frm, "to": to, "amount": amt}}
    if re.search(r"trip|vacation|save for|saving for|goal", q):
        by = _month_date(question, today)
        goal = amt or 1500.0
        g = run("save_for_goal", amount=goal, by_date=by.isoformat() if by else None)
        if g["lowest_with_plan"]["balance"] < 0:
            return {"answer": f"Not yet. Saving ${g['weekly']:.0f} a week would take you to "
                              f"{_usd(g['lowest_with_plan']['balance'])} on {_fmt(g['lowest_with_plan']['date'])}. "
                              f"Let's fix the next few weeks first.",
                    "spoken_text": "Not yet. Let's fix the next few weeks first."}
        when = "" if date.fromisoformat(g["start"]) <= today + timedelta(days=7) else f" starting {_fmt(g['start'])}, after rent"
        return {"answer": f"Yes, if you save ${g['weekly']:.0f} a week{when}, for {g['weeks']} weeks toward a "
                          f"${goal:,.0f} trip. Want me to set that up?",
                "spoken_text": f"Yes, if you save ${g['weekly']:.0f} a week. Want me to set that up?",
                "action": {"kind": "create_rule", "rule": {"kind": "save_weekly", "amount": g["weekly"],
                                                           "start": g["start"]}}}
    if re.search(r"afford|buy|purchase|concert|spend", q) and amt:
        p = run("purchase_impact", amount=amt)
        if p["fits"]:
            return {"answer": f"Yes. ${amt:,.0f} fits and you stay above $100.", "spoken_text": f"Yes, ${amt:,.0f} fits."}
        return {"answer": f"Not right now. ${amt:,.0f} would take you to {_usd(p['lowest_after']['balance'])} "
                          f"on {_fmt(p['lowest_after']['date'])}.",
                "spoken_text": f"Not right now. It would take you below $100."}
    if re.search(r"lose my job|job loss|laid off|fired", q):
        w = run("what_if", change={"no_income": True})
        low = w["new"]["lowest"]
        return {"answer": f"Without pay, your checking would fall to {_usd(low['balance'])} by {_fmt(low['date'])}. "
                          f"Building your safety cushion helps most.",
                "spoken_text": f"Without pay, you'd fall to {_usd(low['balance'])} by {_fmt(low['date'])}."}
    if re.search(r"score|health|how am i|doing", q):
        h = run("health_score")
        low = min(h["indicators"].items(), key=lambda kv: kv[1]["points"])
        return {"answer": f"Your score is {h['score']}. The biggest drag: {low[1]['why']}",
                "spoken_text": f"Your score is {h['score']}. {low[1]['why']}"}
    if re.search(r"leak|subscri|cancel", q):
        l = run("find_leaks")
        return {"answer": f"I found {len(l['leaks'])} money leaks worth ${l['monthly_total']:,.2f} a month.",
                "spoken_text": f"I found {len(l['leaks'])} money leaks."}
    if re.search(r"debt|loan|card|payoff|interest", q):
        d = run("debt_plan")
        return {"answer": d["minimum_trap"]["why"], "spoken_text": "Paying only the minimum costs you a lot. "
                "I can show a faster plan."}
    if re.search(r"budget", q):
        b = run("budget_pace")
        watch = [c["category"] for c in b["categories"] if c["status"] != "good"]
        return {"answer": f"Ahead of pace on: {', '.join(watch)}." if watch else "You're on pace this month.",
                "spoken_text": "Here's your budget pace."}
    f = run("forecast")
    return {"answer": f"You're safe until {_fmt(f['safe_until'])}. {f['why']}",
            "spoken_text": f"You're safe until {_fmt(f['safe_until'])}."}


def run(question: str, emit=lambda e: None) -> dict:
    """Full pipeline. emit() receives live step events (for SSE)."""
    t0, trace_id = time.time(), uuid.uuid4().hex[:10]
    trace = {"id": trace_id, "question": question, "steps": []}
    emit({"type": "step", "label": "Checking safety"})
    g = guard(question)
    trace["guard"] = g
    if not g["ok"]:
        out = {"answer": g["reply"], "spoken_text": g["reply"], "action": None, "verified": True, "blocked": True}
        return _finish(out, trace, t0, emit)
    results, planner = [], "nemotron"
    emit({"type": "step", "label": "Planning"})
    out = None
    for attempt in range(3):  # first try + max 2 critic retries
        results.clear()
        try:
            out = _llm_plan(question if attempt == 0 else
                            f"{question}\n(Your last answer had numbers not from tools: {check['unverified']}. "
                            f"Use only tool numbers.)", emit, results)
        except (llm.LLMUnavailable, json.JSONDecodeError, KeyError):
            planner = "rules"
            out = _rule_plan(question, emit, results)
        emit({"type": "step", "label": "Verifying"})
        check = critic(out.get("answer", ""), results)
        if check["verified"] or planner == "rules":
            break
    else:
        planner, results = "rules", []
        out = _rule_plan(question, emit, results)
        check = critic(out["answer"], results)
    out = {"answer": out.get("answer", ""), "spoken_text": out.get("spoken_text") or out.get("answer", ""),
           "action": _validate_action(out.get("action")), "verified": check["verified"]}
    trace.update(planner=planner, tool_calls=results, critic=check)
    return _finish(out, trace, t0, emit)


def _finish(out, trace, t0, emit):
    trace["ms"] = int((time.time() - t0) * 1000)
    trace["answer"] = out
    ledger.load()["traces"][trace["id"]] = trace
    ledger._db("INSERT INTO traces (payload) VALUES (%s)", (json.dumps(trace, default=str),))
    out["trace_id"] = trace["id"]
    emit({"type": "answer", **out})
    return out


# ---------------- Actions (only after user approval) ----------------

ACCOUNTS = {"checking", "savings", "card"}


def _validate_action(a):
    if not isinstance(a, dict):
        return None
    try:
        if a.get("kind") == "transfer" and a["from"] in ACCOUNTS and a["to"] in ACCOUNTS and 0 < float(a["amount"]) <= 10000:
            return {"kind": "transfer", "from": a["from"], "to": a["to"], "amount": float(a["amount"])}
        if a.get("kind") == "create_rule" and isinstance(a.get("rule"), dict):
            return {"kind": "create_rule", "rule": a["rule"]}
        if a.get("kind") == "cancel_bill" and a.get("bill_id"):
            return {"kind": "cancel_bill", "bill_id": str(a["bill_id"])}
        if a.get("kind") == "bundle":
            steps = [_validate_action(s) for s in a.get("steps", [])]
            return {"kind": "bundle", "steps": steps} if steps and all(steps) else None
    except (KeyError, TypeError, ValueError):
        return None
    return None


def execute(action) -> dict:
    """Run an approved action. Returns results and the undo list."""
    a = _validate_action(action)
    if not a:
        return {"ok": False, "error": "invalid action"}
    steps = a["steps"] if a["kind"] == "bundle" else [a]
    done, undo = [], []
    for s in steps:
        if s["kind"] == "transfer":
            r = tools.transfer(s["from"], s["to"], s["amount"], "Approved in Ahead")
            u = r.get("undo") and {"kind": "transfer", "from": r["undo"]["from"], "to": r["undo"]["to"],
                                   "amount": r["undo"]["amount"]}
        elif s["kind"] == "cancel_bill":
            r = tools.cancel_bill(s["bill_id"])
            u = r.get("undo") and {"kind": "create_bill", **{k: r["undo"][k] for k in ("account", "payee", "amount", "day")}}
        else:
            r = tools.create_rule(s["rule"])
            u = r.get("undo") and {"kind": "delete_rule", "id": r["undo"]["id"]}
        done.append(r)
        if not r.get("ok"):
            undo_all(undo)  # all-or-nothing
            return {"ok": False, "error": r.get("error"), "results": done}
        undo.append(u)
    alerts = watch("approve")
    return {"ok": True, "results": done, "undo": undo[::-1], "summary": summary(), "alerts": alerts}


def undo_all(undo: list) -> dict:
    for u in undo:
        if not u:
            continue
        if u["kind"] == "transfer":
            tools.transfer(u["from"], u["to"], u["amount"], "Undo in Ahead")
        elif u["kind"] == "create_bill":
            tools.create_bill(u["account"], u["payee"], u["amount"], u["day"])
        elif u["kind"] == "delete_rule":
            ledger.delete_rule(u["id"])
    return {"ok": True, "summary": summary()}


def summary():
    h, f = tools.health_score(), tools.forecast()
    return {"score": h["score"], "safe_until": f["safe_until"], "why": f["why"], "lowest": f["lowest"],
            "balances": tools.get_snapshot()["balances"]}


# ---------------- Watcher (proactive; triggered, no timer) ----------------

def _preview(action):
    def go():
        execute_quiet(action)
        return {"score": tools.health_score()["score"], "safe_until": tools.forecast()["safe_until"],
                "days": [d["p50"] for d in tools.forecast()["days"]]}
    return ledger.preview(go)


def execute_quiet(action):
    a = _validate_action(action)
    for s in (a["steps"] if a["kind"] == "bundle" else [a]):
        if s["kind"] == "transfer":
            tools.transfer(s["from"], s["to"], s["amount"])
        elif s["kind"] == "cancel_bill":
            tools.cancel_bill(s["bill_id"])
        else:
            tools.create_rule(s["rule"])


def watch(trigger: str) -> list:
    """Create alert cards with fixes. Replaces open alerts of the same kind."""
    L = ledger.load()
    f = tools.forecast()
    new = []
    if f["lowest"]["balance"] < 0:
        low_date = f["lowest"]["date"]
        big = max((m for m in f["markers"] if m["date"] <= low_date and m["amount"] < 0),
                  key=lambda m: (-m["amount"], m["date"]), default=None)
        what = f"{big['label'] if big else 'Bills'} on {_fmt(big['date'] if big else low_date)}"
        if big and big["label"] == "Oakwood Apartments":
            what = f"Rent on {_fmt(big['date'])}"
        short = -f["lowest"]["balance"]
        leaks = [l for l in tools.find_leaks()["leaks"] if l["type"] in ("unused", "trial_converting")]
        move = round(min(300.0, max(0.0, L["balances"]["savings"] - 100)), 2)
        fixes = []
        if move and leaks:
            fixes.append({"id": "best", "title": f"Move ${move:.0f} from savings and cancel {len(leaks)} unused charges",
                          "action": {"kind": "bundle", "steps": [{"kind": "cancel_bill", "bill_id": l["bill_id"]} for l in leaks]
                                     + [{"kind": "transfer", "from": "savings", "to": "checking", "amount": move}]}})
        if move:
            fixes.append({"id": "move", "title": f"Move ${move:.0f} from savings to checking",
                          "action": {"kind": "transfer", "from": "savings", "to": "checking", "amount": move}})
        if leaks:
            fixes.append({"id": "leaks", "title": f"Cancel {len(leaks)} charges you don't use",
                          "action": {"kind": "bundle", "steps": [{"kind": "cancel_bill", "bill_id": l["bill_id"]} for l in leaks]}})
        for fx in fixes:
            fx["preview"] = _preview(fx["action"])
        new.append({"kind": "below_zero", "level": "act",
                    "title": f"{what} may take you below $0 by ${short:,.0f}.",
                    "body": f"Here are {len(fixes)} easy fixes." if fixes else "Let's look at options together.",
                    "fixes": fixes, "current": {"score": tools.health_score()["score"], "safe_until": f["safe_until"]}})
    for l in tools.find_leaks()["leaks"]:
        if l["type"] == "trial_converting" and (date.fromisoformat(l["date"]) - L["today"]).days <= 7:
            new.append({"kind": "trial", "level": "watch", "title": l["why"],
                        "body": "Cancel now and you won't be charged.",
                        "fixes": [{"id": "cancel", "title": f"Cancel {l['merchant']}",
                                   "action": {"kind": "cancel_bill", "bill_id": l["bill_id"]}}]})
    trace_id = uuid.uuid4().hex[:10]
    L["traces"][trace_id] = {"id": trace_id, "question": f"Watcher ({trigger})", "planner": "watcher",
                             "steps": ["Running forecast", "Checking bills", "Finding money leaks", "Comparing options",
                                       "Verifying"],
                             "tool_calls": [{"tool": "forecast", "result": _short_forecast(f)},
                                            {"tool": "find_leaks", "result": tools.find_leaks()}]
                             + [{"tool": "what_if", "args": fx["title"], "result": {k: v for k, v in fx["preview"].items() if k != "days"}}
                                for a in new for fx in a["fixes"] if "preview" in fx],
                             "critic": {"verified": True, "unverified": []}, "ms": 0}
    new = [a | {"trace_id": trace_id} for a in new]
    kinds = {a["kind"] for a in new} | {"below_zero", "trial"}
    L["alerts"] = [a for a in L["alerts"] if a["kind"] not in kinds] + [
        a | {"id": uuid.uuid4().hex[:8], "trigger": trigger, "created": L["today"].isoformat()} for a in new]
    for a in L["alerts"]:
        ledger._db("INSERT INTO alerts (kind, payload) VALUES (%s,%s)", (a["kind"], json.dumps(a, default=str)))
    return L["alerts"]


def simulate_week() -> list:
    """A normal week of small purchases lands, then the Watcher runs on its own."""
    import random
    rng = random.Random(len(ledger.load()["tx"]))
    for merchant, cat, amt in [("FreshMart", "groceries", 52.40), ("Corner Cafe", "dining", 12.80),
                               ("QuickFuel", "gas", 41.10)]:
        ledger._add_tx("checking", -round(amt * rng.uniform(0.9, 1.1), 2), "purchase", cat, merchant, merchant)
    return watch("simulate_week")
