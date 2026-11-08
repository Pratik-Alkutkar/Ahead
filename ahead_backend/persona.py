"""Maya's demo data. Single source for seed.py and tests. All dates relative to today; deterministic."""
import random
from datetime import date, timedelta

HISTORY_DAYS = 90
PAY = 1600.00  # biweekly net
TARGET = {"checking": 846.19, "savings": 3214.62, "card": -1186.40}  # card negative = owed
CARD_LIMIT = 2000.00  # Nessie has no credit limit; lives in our DB
CARD_APR = 24.99
AGE = 24
GROSS_ANNUAL = 55000.00  # before tax; ~$1,600 net biweekly after taxes and her 3% 401(k)
# Outside accounts (Nessie has none): shown in the whole picture, never in cash forecasts
INVESTMENTS = [
    {"name": "401(k)", "kind": "401k", "balance": 5486.35, "holding": "Target-date fund · includes internship rollover", "contribution_pct": 3, "match_pct": 5},
    {"name": "Roth IRA", "kind": "ira", "balance": 3786.77, "holding": "Index fund · summer jobs and graduation gifts"},
]

MERCHANTS = {  # name -> category
    "FreshMart": "groceries", "Corner Cafe": "dining", "Noodle Bar": "dining", "Taco Spot": "dining",
    "QuickFuel": "gas", "ShopCo": "shopping", "Urban Threads": "shopping",
    "Oakwood Apartments": "rent", "Metro Auto Finance": "loan", "Brightline Mobile": "phone",
    "City Power & Water": "utilities", "Card Payment": "card_payment",
    "StreamFlix": "subscription", "TuneBox": "subscription", "FitClub": "subscription",
    "ShowMax+": "subscription", "CloudSafe": "subscription", "NewsDaily": "subscription",
    "MealKit Pro": "subscription", "Main St Auto Repair": "car", "PayLater": "bnpl", "Acme Corp Payroll": "income",
}

# Monthly fixed bills paid from checking: (payee, amount, day_of_month)
FIXED = [("Oakwood Apartments", 1100.00, 1), ("City Power & Water", 88.00, 5),
         ("Brightline Mobile", 65.00, 10), ("Metro Auto Finance", 285.00, 15),
         ("Card Payment", 300.00, 20)]
# Subscriptions on the card: (payee, amount, day, used)
SUBS = [("StreamFlix", 15.49, 3, True), ("TuneBox", 11.99, 8, True), ("FitClub", 39.99, 12, False),
        ("ShowMax+", 13.99, 17, False), ("CloudSafe", 2.99, 22, True), ("NewsDaily", 7.99, 26, True)]
PRICE_JUMP = ("StreamFlix", 12.99)  # old price before the last 30 days
TRIAL = {"payee": "MealKit Pro", "amount": 59.99, "converts_in_days": 5}
LOAN = {"type": "auto", "amount": 13750, "monthly_payment": 285, "credit_score": 662,
        "description": "Auto loan", "apr": 8.9}
BNPL = {"merchant": "PayLater", "item": "Headphones", "total": 240.00, "installment": 60.00,
        "count": 4, "every_days": 14, "first_offset": -21}  # paid -21, -7; due +7, +21

# She just moved for her first job: big one-offs explain the thin cushion. (days_ago, merchant, amount, desc)
# kind=one_time: kept out of the Monte Carlo pool and the 30-day projection.
ONE_TIME = [(85, "Oakwood Apartments", 1100.00, "Security deposit"), (70, "ShopCo", 950.00, "Furniture"),
            (40, "Main St Auto Repair", 650.00, "Car repair")]

# Variable spend: category -> (merchants, chance per day, mean, sd, account)
VARIABLE = {
    "groceries": (["FreshMart"], 0.30, 46, 12, "checking"),
    "dining": (["Corner Cafe", "Noodle Bar", "Taco Spot"], 0.40, 14, 5, "checking"),
    "gas": (["QuickFuel"], 0.15, 38, 6, "checking"),
    "shopping": (["ShopCo", "Urban Threads"], 0.10, 35, 15, "card"),
}


def _tx(acct, d, amount, kind, merchant, desc=None):
    return {"account": acct, "date": d.isoformat(), "amount": round(amount, 2), "kind": kind,
            "merchant": merchant, "category": MERCHANTS[merchant], "description": desc or merchant}


def _month_days(today, day):
    """Every date with day-of-month `day` in the history window."""
    start = today - timedelta(days=HISTORY_DAYS)
    d, out = date(start.year, start.month, 1), []
    while d < today:
        hit = d.replace(day=day)
        if start <= hit < today:
            out.append(hit)
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return out


def history(today: date | None = None) -> list[dict]:
    today = today or date.today()
    rng = random.Random(42)
    tx = []
    # Paychecks: last one 3 days ago, every 14 days back
    d = today - timedelta(days=3)
    while d >= today - timedelta(days=HISTORY_DAYS):
        tx.append(_tx("checking", d, PAY, "deposit", "Acme Corp Payroll", "Paycheck"))
        d -= timedelta(days=14)
    for payee, amt, day in FIXED:
        for hit in _month_days(today, day):
            a = amt + (rng.uniform(-12, 12) if payee == "City Power & Water" else 0)
            tx.append(_tx("checking", hit, -a, "bill", payee))
            if payee == "Card Payment":
                tx.append(_tx("card", hit, amt, "transfer", payee))
    for payee, amt, day, _ in SUBS:
        for hit in _month_days(today, day):
            price = PRICE_JUMP[1] if payee == PRICE_JUMP[0] and hit < today - timedelta(days=30) else amt
            tx.append(_tx("card", hit, -price, "bill", payee))
    for i in range(BNPL["count"]):
        due = today + timedelta(days=BNPL["first_offset"] + i * BNPL["every_days"])
        if due < today:
            tx.append(_tx("checking", due, -BNPL["installment"], "bill", BNPL["merchant"], f"{BNPL['item']} {i+1}/4"))
    for back, merchant, amt, desc in ONE_TIME:
        tx.append(_tx("checking", today - timedelta(days=back), -amt, "one_time", merchant, f"One-time: {desc}"))
    for back in range(HISTORY_DAYS, 0, -1):
        d = today - timedelta(days=back)
        for cat, (names, p, mean, sd, acct) in VARIABLE.items():
            if rng.random() < p:
                tx.append(_tx(acct, d, -max(4.0, rng.gauss(mean, sd)), "purchase", rng.choice(names)))
    return sorted(tx, key=lambda t: t["date"])


def opening_balances(tx: list[dict]) -> dict:
    """Opening balance per account so the ledger lands exactly on TARGET today."""
    return {a: round(TARGET[a] - sum(t["amount"] for t in tx if t["account"] == a), 2) for a in TARGET}


def future_bills(today: date | None = None) -> list[dict]:
    today = today or date.today()

    def next_on(day):
        d = today.replace(day=day) if today.day < day else (today.replace(day=28) + timedelta(days=4)).replace(day=day)
        return d.isoformat()

    bills = [{"account": "checking", "payee": p, "amount": a, "day": dd, "next": next_on(dd), "status": "recurring"}
             for p, a, dd in FIXED]
    bills += [{"account": "card", "payee": p, "amount": a, "day": dd, "next": next_on(dd), "status": "recurring",
               "used": used} for p, a, dd, used in SUBS]
    t = today + timedelta(days=TRIAL["converts_in_days"])
    bills.append({"account": "card", "payee": TRIAL["payee"], "amount": TRIAL["amount"], "day": t.day,
                  "next": t.isoformat(), "status": "pending", "trial": True, "used": False})
    return bills


def bnpl_installments(today: date | None = None) -> list[dict]:
    today = today or date.today()
    return [{"merchant": BNPL["merchant"], "item": BNPL["item"], "n": i + 1, "of": BNPL["count"],
             "amount": BNPL["installment"],
             "due": (today + timedelta(days=BNPL["first_offset"] + i * BNPL["every_days"])).isoformat(),
             "paid": BNPL["first_offset"] + i * BNPL["every_days"] < 0}
            for i in range(BNPL["count"])]
