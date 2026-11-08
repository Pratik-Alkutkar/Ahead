"""Ledger state for tools. Reads Tiger if DATABASE_URL is set, else Maya's persona in memory.
Writes update memory, Tiger (if set) and Nessie (if seeded); the ledger stays the source of truth."""
import json
import uuid
from datetime import date, datetime, timedelta

import persona
from config import CACHE, DATABASE_URL

_state = None
_PREVIEW = False  # True while previewing a fix on a copy: no Tiger/Nessie writes


def _d(x):
    return x if isinstance(x, date) and not isinstance(x, datetime) else (
        x.date() if isinstance(x, datetime) else date.fromisoformat(str(x)[:10]))


def _from_persona():
    import sync
    data = sync.from_persona()
    op = persona.opening_balances(persona.history())
    return _build(data["tx"], data["bills"], persona.bnpl_installments(), data["loans"], op, persona.CARD_LIMIT, [])


def _from_db():
    from db import connect
    with connect() as c, c.cursor() as cur:
        q = lambda sql: (cur.execute(sql), [dict(zip([d.name for d in cur.description], r)) for r in cur.fetchall()])[1]
        tx = [t | {"date": t.pop("ts")} for t in q("SELECT id,account,ts,amount,kind,category,merchant,description FROM transactions")]
        bills = [b | {"next": b.pop("next_date")} for b in q("SELECT * FROM bills")]
        bnpl = [b | {"of": b.pop("of_n")} for b in q("SELECT * FROM bnpl")]
        loans = q("SELECT * FROM loans")
        op = {r["key"]: r["opening_balance"] for r in q("SELECT key, opening_balance FROM accounts")}
        limit = q("SELECT credit_limit FROM credit_limits WHERE account='card'")[0]["credit_limit"]
        blocked = [r["merchant"] for r in q("SELECT merchant FROM blocked_merchants")]
    return _build(tx, bills, bnpl, loans, op, limit, blocked)


def _build(tx, bills, bnpl, loans, opening, limit, blocked):
    tx = [t | {"date": _d(t["date"]), "amount": float(t["amount"])} for t in tx]
    bal = {k: float(v) for k, v in opening.items()}
    for t in tx:
        bal[t["account"]] += t["amount"]
    return {"today": date.today(), "tx": tx, "balances": bal, "card_limit": float(limit),
            "card_apr": persona.CARD_APR, "pay": persona.PAY,
            "bills": [b | {"next": _d(b["next"]), "amount": float(b["amount"])} for b in bills],
            "bnpl": [b | {"due": _d(b["due"]), "amount": float(b["amount"])} for b in bnpl],
            "loans": [l | {"amount": float(l["amount"]), "monthly_payment": float(l["monthly_payment"]),
                           "apr": float(l["apr"])} for l in loans],
            "blocked": list(blocked), "rules": [], "alerts": [], "traces": {}}


def load(refresh=False):
    global _state
    if _state is None or refresh:
        try:
            _state = _from_db() if DATABASE_URL else _from_persona()
        except Exception as e:  # DB down: demo must not break
            print(f"Ledger DB unavailable ({type(e).__name__}); using built-in data")
            _state = _from_persona()
    return _state


def reset():
    global _state
    _state = None


# ---------- writes ----------

def _ids():
    f = CACHE / "ids.json"
    return json.loads(f.read_text()) if f.exists() else {}


def _nessie(fn):
    """Best-effort Nessie mirror. Returns True on success; ledger write happens regardless."""
    if _PREVIEW or not _ids().get("accounts"):
        return False
    try:
        fn()
        return True
    except Exception:
        return False


def _db(sql, args):
    if DATABASE_URL and not _PREVIEW:
        from db import connect
        with connect() as c:
            c.execute(sql, args)


def _add_tx(account, amount, kind, category, merchant, desc):
    t = {"id": f"app-{uuid.uuid4().hex[:10]}", "account": account, "date": load()["today"], "amount": amount,
         "kind": kind, "category": category, "merchant": merchant, "description": desc}
    S = load()
    S["tx"].append(t)
    S["balances"][account] += amount
    _db("INSERT INTO transactions VALUES (%s,%s,now(),%s,%s,%s,%s,%s,'app')",
        (t["id"], account, amount, kind, category, merchant, desc))
    return t


def transfer(from_acct, to_acct, amount, memo="Transfer"):
    S = load()
    if from_acct not in S["balances"] or to_acct not in S["balances"] or from_acct == to_acct:
        return {"ok": False, "error": "unknown account"}
    if not 0 < amount <= 10000:
        return {"ok": False, "error": "amount must be between $0 and $10,000"}
    import nessie
    ids = _ids().get("accounts", {})
    mirrored = _nessie(lambda: nessie.post(f"/accounts/{ids[from_acct]}/transfers", {
        "medium": "balance", "payee_id": ids[to_acct], "amount": amount,
        "transaction_date": S["today"].isoformat(), "description": memo}))
    a = _add_tx(from_acct, -amount, "transfer", "transfer", memo, memo)
    b = _add_tx(to_acct, amount, "transfer", "transfer", memo, memo)
    return {"ok": True, "tx_ids": [a["id"], b["id"]], "nessie": mirrored,
            "balances": {k: round(v, 2) for k, v in S["balances"].items()},
            "undo": {"action": "transfer", "from": to_acct, "to": from_acct, "amount": amount}}


def _bill(bill_id):
    return next((b for b in load()["bills"] if b["id"] == bill_id), None)


def cancel_bill(bill_id):
    b = _bill(bill_id)
    if not b:
        return {"ok": False, "error": "bill not found"}
    import nessie
    mirrored = _nessie(lambda: nessie.delete(f"/bills/{bill_id}")) if not bill_id.startswith(("local", "app")) else False
    b["status"] = "cancelled"
    _db("UPDATE bills SET status='cancelled' WHERE id=%s", (bill_id,))
    block_merchant(b["payee"])
    return {"ok": True, "bill_id": bill_id, "merchant": b["payee"], "saved_per_month": b["amount"], "nessie": mirrored,
            "undo": {"action": "create_bill", "account": b["account"], "payee": b["payee"],
                     "amount": b["amount"], "day": b["day"]}}


def create_bill(account, payee, amount, day):
    S = load()
    import nessie
    ids = _ids().get("accounts", {})
    nxt = S["today"].replace(day=min(day, 28))
    if nxt <= S["today"]:
        nxt = (nxt.replace(day=28) + timedelta(days=4)).replace(day=min(day, 28))
    bid = f"app-bill-{uuid.uuid4().hex[:8]}"

    def call():
        nonlocal bid
        bid = nessie.post(f"/accounts/{ids[account]}/bills", {"status": "recurring", "payee": payee,
                          "nickname": payee, "payment_date": nxt.isoformat(), "recurring_date": day,
                          "payment_amount": amount})
    mirrored = _nessie(call)
    # Undo of a cancel: replace the cancelled record and keep its flags (trial/unused) so leaks still see it.
    old = next((x for x in S["bills"] if x["status"] == "cancelled" and x["payee"] == payee and x["account"] == account), None)
    flags = {"trial": old.get("trial", False), "used": old.get("used", True)} if old else {"trial": False, "used": True}
    if old:
        S["bills"].remove(old)
        nxt = old["next"] if old["next"] > S["today"] else nxt
        _db("DELETE FROM bills WHERE id=%s", (old["id"],))
    b = {"id": bid, "account": account, "payee": payee, "amount": float(amount), "day": day, "next": nxt,
         "status": "pending" if flags["trial"] else "recurring", **flags}
    S["bills"].append(b)
    _db("INSERT INTO bills VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (bid, account, payee, amount, day, nxt, b["status"], flags["trial"], flags["used"]))
    unblock_merchant(payee)
    return {"ok": True, "bill_id": bid, "nessie": mirrored}


def block_merchant(merchant):
    S = load()
    if merchant not in S["blocked"]:
        S["blocked"].append(merchant)
        _db("INSERT INTO blocked_merchants (merchant) VALUES (%s) ON CONFLICT DO NOTHING", (merchant,))
    return {"ok": True, "blocked": merchant}


def unblock_merchant(merchant):
    S = load()
    if merchant in S["blocked"]:
        S["blocked"].remove(merchant)
    _db("DELETE FROM blocked_merchants WHERE merchant=%s", (merchant,))
    return {"ok": True}


RULE_KINDS = {"save_weekly": {"amount"}, "keep_checking_above": {"amount"}}


def create_rule(rule: dict):
    kind = rule.get("kind")
    if kind not in RULE_KINDS or not RULE_KINDS[kind] <= rule.keys():
        return {"ok": False, "error": f"rule kind must be one of {list(RULE_KINDS)} with an amount"}
    if rule.get("start"):
        try:
            date.fromisoformat(rule["start"])
        except (TypeError, ValueError):
            return {"ok": False, "error": "start must be YYYY-MM-DD"}
    if not 0 < float(rule["amount"]) <= 5000:
        return {"ok": False, "error": "amount must be between $0 and $5,000"}
    S = load()
    rule = rule | {"id": f"rule-{uuid.uuid4().hex[:8]}"}
    S["rules"].append(rule)
    _db("INSERT INTO rules (rule) VALUES (%s)", (json.dumps(rule),))
    return {"ok": True, "rule": rule, "undo": {"action": "delete_rule", "id": rule["id"]}}


def delete_rule(rule_id):
    S = load()
    S["rules"] = [r for r in S["rules"] if r["id"] != rule_id]
    _db("DELETE FROM rules WHERE rule->>'id'=%s", (rule_id,))
    return {"ok": True}


def preview(fn):
    """Run fn() against a copy of the ledger with writes disabled; returns fn's result."""
    import copy
    global _state, _PREVIEW
    saved = load()
    _state, _PREVIEW = copy.deepcopy(saved), True
    try:
        return fn()
    finally:
        _state, _PREVIEW = saved, False
