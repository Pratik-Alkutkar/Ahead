import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import ledger  # noqa: E402
import tools  # noqa: E402


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Built-in persona data, no Nessie, no DB."""
    monkeypatch.setattr(ledger, "DATABASE_URL", "")
    monkeypatch.setattr(ledger, "_ids", lambda: {})
    ledger.reset()
    yield
    ledger.reset()


def _demo_fix():
    for l in tools.find_leaks()["leaks"]:
        if l["type"] in ("unused", "trial_converting"):
            tools.cancel_bill(l["bill_id"])
    return tools.transfer("savings", "checking", 300, "Cover rent")


def test_outputs_are_json():
    for fn in (tools.get_snapshot, tools.get_cashflow, tools.health_score, tools.forecast, tools.find_leaks,
               tools.build_budget, tools.budget_pace, tools.debt_plan):
        json.dumps(fn())


def test_health_score_start():
    h = tools.health_score()
    assert 55 <= h["score"] <= 61
    assert len(h["indicators"]) == 4
    assert all(0 <= i["points"] <= 25 and i["why"] for i in h["indicators"].values())


def test_lin_capped_both_directions():
    assert tools._lin(10, 0, 6) == 25 and tools._lin(-1, 0, 6) == 0
    assert tools._lin(0.95, 0.9, 0.1) == 0 and tools._lin(0.05, 0.9, 0.1) == 25
    assert tools._lin(0.5, 0.9, 0.1) == 12.5


def test_forecast_shape_and_alert():
    f = tools.forecast()
    assert len(f["days"]) == 60
    assert all(d["p10"] <= d["p50"] <= d["p90"] for d in f["days"])
    assert f["safe_until"] is not None and f["lowest"]["balance"] < 0  # overdraft risk before rent
    rent = [m for m in f["markers"] if m["label"] == "Oakwood Apartments"][0]
    assert f["safe_until"] < rent["date"]
    assert tools.forecast() == f  # deterministic


def test_demo_fix_moves_score_and_safe_date():
    s0, f0 = tools.health_score()["score"], tools.forecast()["safe_until"]
    r = _demo_fix()
    assert r["ok"]
    assert tools.health_score()["score"] >= s0 + 5
    after = tools.forecast()["safe_until"]
    assert after is None or after > f0  # None = safe for all 60 days


def test_what_if_two_lines():
    w = tools.what_if(change={"start_delta": 300})
    assert len(w["current"]["days"]) == len(w["new"]["days"]) == 60
    assert w["new"]["lowest"]["balance"] > w["current"]["lowest"]["balance"]


def test_purchase_impact():
    assert tools.purchase_impact(amount=300)["fits"] is False
    p = tools.purchase_impact(amount=0.01)
    assert p["safe_until_after"] == p["safe_until_now"]


def test_find_leaks():
    types = sorted(l["type"] for l in tools.find_leaks()["leaks"])
    assert types == ["price_jump", "trial_converting", "unused", "unused"]


def test_budget_and_goal():
    b = tools.build_budget()
    assert any(l["fixed"] for l in b["lines"]) and any(not l["fixed"] for l in b["lines"])
    g = tools.build_budget(goal={"monthly_saving": 2000})
    flex = lambda x: sum(l["monthly"] for l in x["lines"] if not l["fixed"])
    assert flex(g) < flex(b)
    assert all(c["status"] in ("good", "watch", "act") for c in tools.budget_pace()["categories"])


def test_debt_plan():
    d = tools.debt_plan()
    assert d["avalanche"]["interest"] <= d["snowball"]["interest"]
    assert d["minimum_trap"]["months"] > 12


def test_transfer_and_undo():
    before = dict(ledger.load()["balances"])
    r = tools.transfer("savings", "checking", 200)
    assert r["balances"]["checking"] == round(before["checking"] + 200, 2)
    u = r["undo"]
    tools.transfer(u["from"], u["to"], u["amount"])
    assert ledger.load()["balances"] == pytest.approx(before)
    assert not tools.transfer("savings", "checking", -5)["ok"]
    assert not tools.transfer("savings", "nope", 5)["ok"]


def test_cancel_and_undo_bill():
    leak = tools.find_leaks()["leaks"][0]
    r = tools.cancel_bill(leak["bill_id"])
    assert r["ok"] and leak["merchant"] in ledger.load()["blocked"]
    assert leak["bill_id"] not in [l["bill_id"] for l in tools.find_leaks()["leaks"]]
    u = r["undo"]
    tools.create_bill(u["account"], u["payee"], u["amount"], u["day"])
    assert leak["merchant"] not in ledger.load()["blocked"]


def test_rules():
    assert not tools.create_rule({"kind": "rm -rf", "amount": 5})["ok"]
    assert not tools.create_rule({"kind": "save_weekly", "amount": 99999})["ok"]
    r = tools.create_rule({"kind": "save_weekly", "amount": 120})
    assert r["ok"] and any(m["label"] == "Autopilot save" for m in tools.forecast()["markers"])
    ledger.delete_rule(r["rule"]["id"])
    assert not ledger.load()["rules"]


def test_draft_message():
    assert "StreamFlix" in tools.draft_message("cancel", merchant="StreamFlix")["text"]
    assert "error" in tools.draft_message("bogus")


def test_overview_tools():
    pace = tools.budget_pace()
    assert all({"plan", "spent", "used", "status"} <= c.keys() for c in pace["categories"])
    d = tools.upcoming_dues()
    assert d["dues"] == sorted(d["dues"], key=lambda x: x["date"]) and d["total_due"] > 0
    assert {o["name"] for o in d["owed"]} >= {"Auto loan", "Credit card"}
    c = tools.card_overview()
    assert c["owed"] == 800 and c["used"] == 0.4 and c["categories"]
    inv = tools.investments_overview()
    assert inv["total"] == 1850 and inv["next_step"] == "cushion" and inv["free_money_missed"] == 1040
    assert inv["projection"]["with_full_match"] > inv["projection"]["today_plan"]
    assert "not" in inv["disclaimer"].lower()
    json.dumps(inv)
