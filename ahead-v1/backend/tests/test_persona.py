import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import persona  # noqa: E402


def test_deterministic():
    assert persona.history() == persona.history()


def test_ledger_lands_on_target():
    tx = persona.history()
    op = persona.opening_balances(tx)
    for a, target in persona.TARGET.items():
        assert round(op[a] + sum(t["amount"] for t in tx if t["account"] == a), 2) == target


def test_dates_relative_and_in_window():
    for today in (date(2026, 1, 31), date(2026, 3, 1), date(2026, 11, 7)):
        tx = persona.history(today)
        days = {date.fromisoformat(t["date"]) for t in tx}
        assert min(days) >= today - timedelta(days=persona.HISTORY_DAYS) and max(days) < today
        assert sum(1 for t in tx if t["merchant"] == "Oakwood Apartments" and t["kind"] == "bill") in (2, 3)  # 90 days spans 2-3 firsts


def test_persona_shape():
    tx, bills = persona.history(), persona.future_bills()
    assert sum(1 for t in tx if t["category"] == "income") >= 6  # biweekly over 90 days
    subs = [b for b in bills if b["account"] == "card" and not b.get("trial")]
    assert len(subs) == 6 and sum(not b["used"] for b in subs) == 2
    assert sum(b.get("trial", False) for b in bills) == 1
    sf = sorted((t["date"], -t["amount"]) for t in tx if t["merchant"] == "StreamFlix")
    assert sf[0][1] < sf[-1][1]  # price jump
    assert sum(not i["paid"] for i in persona.bnpl_installments()) == 2
    assert persona.TARGET["savings"] == 400
