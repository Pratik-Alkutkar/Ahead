"""Create Maya in Nessie with 3 months of history. Reuses customer + merchants across resets."""
import json
from concurrent.futures import ThreadPoolExecutor

import nessie
import persona
from config import CACHE

IDS = CACHE / "ids.json"
MERCH = CACHE / "merchants.json"
ADDR = {"street_number": "12", "street_name": "Elm St", "city": "Pittsburgh", "state": "PA", "zip": "15213"}
NESSIE_TYPE = {"checking": "Checking", "savings": "Savings", "card": "Credit Card"}


def _load(f):
    return json.loads(f.read_text()) if f.exists() else {}


def ensure_merchants() -> dict:
    m = _load(MERCH)
    for name, cat in persona.MERCHANTS.items():
        if name not in m:
            m[name] = nessie.post("/merchants", {"name": name, "category": cat, "address": ADDR,
                                                 "geocode": {"lat": 40.44, "lng": -79.95}})
    MERCH.write_text(json.dumps(m, indent=1))
    return m


def seed() -> dict:
    ids = _load(IDS)
    if not ids.get("customer"):
        ids["customer"] = nessie.post("/customers", {"first_name": "Maya", "last_name": "Rivera", "address": ADDR})
    merch = ensure_merchants()
    tx = persona.history()
    opening = persona.opening_balances(tx)
    accts = {}
    for key, typ in NESSIE_TYPE.items():
        bal = abs(opening[key]) if key == "card" else max(0, opening[key])
        accts[key] = nessie.post(f"/customers/{ids['customer']}/accounts",
                                 {"type": typ, "nickname": f"Maya {typ}", "rewards": 0, "balance": int(bal)})
    ids["accounts"] = accts
    IDS.write_text(json.dumps(ids, indent=1))

    calls = []
    for t in tx:
        a = accts[t["account"]]
        if t["merchant"] == "Card Payment":
            if t["account"] == "checking":  # one Nessie transfer covers both ledger sides
                calls.append((f"/accounts/{a}/transfers", {"medium": "balance", "payee_id": accts["card"],
                              "amount": -t["amount"], "transaction_date": t["date"], "description": "Card Payment"}))
        elif t["amount"] > 0:
            calls.append((f"/accounts/{a}/deposits", {"medium": "balance", "transaction_date": t["date"],
                          "amount": t["amount"], "description": t["description"]}))
        else:
            calls.append((f"/accounts/{a}/purchases", {"merchant_id": merch[t["merchant"]], "medium": "balance",
                          "purchase_date": t["date"], "amount": -t["amount"], "description": t["description"]}))
    for b in persona.future_bills():
        calls.append((f"/accounts/{accts[b['account']]}/bills", {
            "status": b["status"], "payee": b["payee"], "nickname": b["payee"], "payment_date": b["next"],
            "recurring_date": b["day"], "payment_amount": b["amount"]}))
    L = persona.LOAN
    calls.append((f"/accounts/{accts['checking']}/loans", {"type": L["type"], "status": "approved",
                  "credit_score": L["credit_score"], "monthly_payment": L["monthly_payment"],
                  "amount": L["amount"], "description": L["description"]}))
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda c: nessie.post(*c), calls))
    return ids


def wipe():
    """Delete Maya's accounts (cascades their purchases/deposits/bills). Never the key-wide /data."""
    ids = _load(IDS)
    for a in (ids.get("accounts") or {}).values():
        nessie.delete(f"/accounts/{a}")


if __name__ == "__main__":
    print(seed())
