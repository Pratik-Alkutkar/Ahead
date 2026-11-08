import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
import ledger  # noqa: E402
import main  # noqa: E402

c = TestClient(main.app)


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(ledger, "DATABASE_URL", "")
    monkeypatch.setattr(ledger, "_ids", lambda: {})
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("NESSIE_API_KEY", raising=False)
    ledger.reset()
    main.UNDO.clear()
    yield
    ledger.reset()


def test_read_routes():
    s = c.get("/summary").json()
    assert s["score"] == 58 and s["safe_until"] and s["money_saved"]["monthly"] == 0
    assert len(c.get("/forecast").json()["days"]) == 60
    assert c.get("/alerts").json() == {"alerts": []}
    assert len(c.get("/leaks").json()["leaks"]) == 4
    assert {"budget", "pace", "debt"} <= c.get("/budget").json().keys()
    assert {"budget", "debt", "card", "investments"} == c.get("/overview").json().keys()
    assert c.post("/budget/build", json={"monthly_saving": 200}).json()["savings_first"] == 200
    w = c.post("/what-if", json={"start_delta": 300}).json()
    assert w["new"]["lowest"]["balance"] > w["current"]["lowest"]["balance"]
    assert "fits" in c.post("/purchase-check", json={"amount": 300}).json()
    assert c.post("/purchase-check", json={"amount": -1}).status_code == 400
    assert c.get("/trace/nope").status_code == 404


def test_demo_flow_over_http():
    s0 = c.get("/summary").json()
    sim = c.post("/simulate-week").json()
    alert = [a for a in sim["alerts"] if a["kind"] == "below_zero"][0]
    r = c.post("/approve", json={"alert_id": alert["id"], "fix_id": alert["fixes"][0]["id"]}).json()
    assert r["ok"] and r["summary"]["score"] > s0["score"] and r["money_saved"]["count"] == 3
    after = c.get("/summary").json()
    assert after["score"] == r["summary"]["score"]
    assert not [a for a in c.get("/alerts").json()["alerts"] if a["kind"] == "below_zero"]
    # leaks: cancel the price-jump one, counter goes up, email drafted
    leak = c.get("/leaks").json()["leaks"][0]
    x = c.post("/leaks/cancel", json={"bill_id": leak["bill_id"]}).json()
    assert x["money_saved"]["count"] == 4 and leak["merchant"] in x["email"]
    # voice/chat ending: propose then approve the rule
    ask = c.post("/ask", json={"q": "Can I afford a trip in March?"}).json()
    assert ask["action"]["kind"] == "create_rule"
    assert c.get(f"/trace/{ask['trace_id']}").json()["critic"]["verified"]
    rule = c.post("/approve", json={"action": ask["action"]}).json()
    assert rule["ok"]
    # undo everything, back to start
    for uid in (rule["undo_id"], x["undo_id"], r["undo_id"]):
        assert c.post("/undo", json={"undo_id": uid}).status_code == 200
    assert c.post("/undo", json={"undo_id": r["undo_id"]}).status_code == 404
    assert c.get("/summary").json()["money_saved"]["count"] == 0


def test_approve_rejects_bad_input():
    assert c.post("/approve", json={}).status_code == 400
    assert c.post("/approve", json={"alert_id": "x", "fix_id": "y"}).status_code == 404
    assert c.post("/approve", json={"action": {"kind": "transfer", "from": "savings", "to": "x", "amount": 5}}).status_code == 400


def test_reset_offline():
    c.post("/simulate-week")
    r = c.post("/reset").json()
    assert r["ok"] and not r["full"] and r["summary"]["alert_count"] == 0
