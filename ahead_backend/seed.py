"""Create Maya in Nessie v2: customer, accounts at today's balances, bills, auto loan.
v2 sets every timestamp on the server (no backdating), so the 3 months of history live in our ledger
(persona -> Tiger); Nessie holds the live accounts and takes every approved money move."""
import json
from concurrent.futures import ThreadPoolExecutor

import nessie
import persona
from config import CACHE

IDS = CACHE / "ids.json"
ADDR = {"street_number": "12", "street_name": "Elm St", "city": "Pittsburgh", "state": "PA", "zip": "15213"}
NESSIE_TYPE = {"checking": "Checking", "savings": "Savings", "card": "Credit Card"}


def _load(f):
    return json.loads(f.read_text()) if f.exists() else {}


def seed() -> dict:
    ids = _load(IDS)
    if not ids.get("customer"):
        ids["customer"] = nessie.post("/customers", {"first_name": "Maya", "last_name": "Rivera", "address": ADDR})
    accts = {}
    for key, typ in NESSIE_TYPE.items():
        body = {"type": typ, "nickname": f"Maya {typ}", "balance_cents": nessie.cents(abs(persona.TARGET[key]))}
        if key == "card":  # card balance = amount owed
            body["credit_limit_cents"] = nessie.cents(persona.CARD_LIMIT)
        accts[key] = nessie.post(f"/customers/{ids['customer']}/accounts", body)
    ids["accounts"] = accts
    IDS.write_text(json.dumps(ids, indent=1))

    calls = [(f"/accounts/{accts[b['account']]}/bills", {
        "status": b["status"], "payee": b["payee"], "nickname": b["payee"], "payment_date": b["next"],
        "recurring_date": b["day"], "payment_amount": b["amount"]}) for b in persona.future_bills()]
    L = persona.LOAN
    calls.append((f"/accounts/{accts['checking']}/loans", {
        "type": L["type"], "status": "approved", "credit_score": L["credit_score"],
        "monthly_payment_cents": nessie.cents(L["monthly_payment"]), "amount_cents": nessie.cents(L["amount"]),
        "description": L["description"]}))
    with ThreadPoolExecutor(4) as pool:  # v2 allows bursts of 30
        list(pool.map(lambda c: nessie.post(*c), calls))
    return ids


def wipe():
    """Delete Maya's accounts (and with them their bills and loans). Never the key-wide /data."""
    ids = _load(IDS)
    for a in (ids.get("accounts") or {}).values():
        nessie.delete(f"/accounts/{a}")
    ids.pop("accounts", None)
    IDS.write_text(json.dumps(ids, indent=1))


if __name__ == "__main__":
    print(seed())
