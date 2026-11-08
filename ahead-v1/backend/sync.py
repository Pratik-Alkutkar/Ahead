"""Nessie -> Tiger ledger. Falls back to snapshot.json, then to persona, if Nessie is down."""
import json

import nessie
import persona
from config import CACHE, ROOT
from db import connect

SNAPSHOT = CACHE / "snapshot.json"


def _kind(cat):
    return "purchase" if cat in persona.VARIABLE else "bill"


def from_nessie() -> dict:
    ids = json.loads((CACHE / "ids.json").read_text())
    acct = ids["accounts"]
    merch = {v: k for k, v in json.loads((CACHE / "merchants.json").read_text()).items()}
    tx = []
    for key, aid in acct.items():
        for p in nessie.get(f"/accounts/{aid}/purchases"):
            name = merch.get(p["merchant_id"], "Unknown")
            cat = persona.MERCHANTS.get(name, "other")
            one_time = (p.get("description") or "").startswith("One-time:")
            tx.append({"id": p["_id"], "account": key, "date": p["purchase_date"], "amount": -p["amount"],
                       "kind": "one_time" if one_time else _kind(cat), "category": cat, "merchant": name, "description": p.get("description")})
        for d in nessie.get(f"/accounts/{aid}/deposits"):
            tx.append({"id": d["_id"], "account": key, "date": d["transaction_date"], "amount": d["amount"],
                       "kind": "deposit", "category": "income", "merchant": "Acme Corp Payroll",
                       "description": d.get("description")})
    side = {v: k for k, v in acct.items()}
    for t in nessie.get(f"/accounts/{acct['checking']}/transfers"):
        for aid, sign in ((t["payer_id"], -1), (t["payee_id"], 1)):
            if aid in side:
                tx.append({"id": f"{t['_id']}:{sign}", "account": side[aid], "date": t["transaction_date"],
                           "amount": sign * t["amount"], "kind": "transfer", "category": "card_payment",
                           "merchant": "Card Payment", "description": t.get("description")})
    bills = []
    extra = {b["payee"]: b for b in persona.future_bills()}  # trial/used flags are app-level
    for key, aid in acct.items():
        for b in nessie.get(f"/accounts/{aid}/bills"):
            e = extra.get(b["payee"], {})
            bills.append({"id": b["_id"], "account": key, "payee": b["payee"], "amount": b["payment_amount"],
                          "day": b.get("recurring_date"), "next": b.get("payment_date"), "status": b["status"],
                          "trial": e.get("trial", False), "used": e.get("used", True)})
    loans = [{"id": l["_id"], "type": l["type"], "amount": l["amount"], "monthly_payment": l["monthly_payment"],
              "apr": persona.LOAN["apr"], "description": l.get("description")}
             for l in nessie.get(f"/accounts/{acct['checking']}/loans")]
    return {"accounts": acct, "tx": tx, "bills": bills, "loans": loans, "source": "nessie"}


def from_persona() -> dict:
    tx = [dict(t, id=f"local-{i}") for i, t in enumerate(persona.history())]
    bills = [dict(b, id=f"local-bill-{i}") for i, b in enumerate(persona.future_bills())]
    L = persona.LOAN
    loans = [{"id": "local-loan", "type": L["type"], "amount": L["amount"],
              "monthly_payment": L["monthly_payment"], "apr": L["apr"], "description": L["description"]}]
    return {"accounts": {k: None for k in persona.TARGET}, "tx": tx, "bills": bills, "loans": loans, "source": "local"}


def load_data() -> dict:
    try:
        data = from_nessie()
        SNAPSHOT.write_text(json.dumps(data))
        return data
    except Exception as e:  # Nessie down/slow: demo must not break
        print(f"Nessie unavailable ({type(e).__name__}); using fallback")
        if SNAPSHOT.exists():
            return json.loads(SNAPSHOT.read_text())
        return from_persona()


def write_ledger(data: dict):
    opening = persona.opening_balances(persona.history())
    src = data["source"]
    with connect() as conn, conn.cursor() as cur:
        cur.execute((ROOT / "schema.sql").read_text())
        cur.executemany("INSERT INTO accounts VALUES (%s,%s,%s,%s)",
                        [(k, data["accounts"].get(k), k, opening[k]) for k in persona.TARGET])
        cur.executemany(
            "INSERT INTO transactions VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            [(t["id"], t["account"], t["date"], t["amount"], t["kind"], t["category"], t["merchant"],
              t["description"], src) for t in data["tx"]])
        cur.executemany("INSERT INTO bills VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        [(b["id"], b["account"], b["payee"], b["amount"], b["day"], b["next"], b["status"],
                          b.get("trial", False), b.get("used", True)) for b in data["bills"]])
        cur.executemany("INSERT INTO loans VALUES (%s,%s,%s,%s,%s,%s)",
                        [(l["id"], l["type"], l["amount"], l["monthly_payment"], l["apr"], l["description"])
                         for l in data["loans"]])
        cur.executemany("INSERT INTO bnpl VALUES (%s,%s,%s,%s,%s,%s,%s)",
                        [(b["merchant"], b["item"], b["n"], b["of"], b["amount"], b["due"], b["paid"])
                         for b in persona.bnpl_installments()])
        cur.execute("INSERT INTO credit_limits VALUES ('card', %s)", (persona.CARD_LIMIT,))
        cur.execute("SELECT a.key, a.opening_balance + COALESCE(SUM(t.amount),0) FROM accounts a "
                    "LEFT JOIN transactions t ON t.account=a.key GROUP BY a.key, a.opening_balance")
        return dict(cur.fetchall())


if __name__ == "__main__":
    print(write_ledger(load_data()))
