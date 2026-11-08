"""Agent tools. Pure Python math over the ledger; all outputs short JSON-able dicts."""
from datetime import date, timedelta
from statistics import median

import numpy as np

import ledger

BUFFER = 100.0
RUNS = 1000


def _money(x):
    return round(float(x), 2)


def _monthly(L, pred, months=3):
    """Totals per 30-day block over the last `months` blocks, for rows matching pred."""
    today = L["today"]
    out = []
    for m in range(months):
        hi, lo = today - timedelta(days=30 * m), today - timedelta(days=30 * (m + 1))
        out.append(sum(t["amount"] for t in L["tx"] if lo <= t["date"] < hi and pred(t)))
    return out


def _is_spend(t):
    return t["amount"] < 0 and t["kind"] != "transfer"


def _is_income(t):
    return t["category"] == "income"


# ---------- SEE ----------

def get_snapshot(customer_id=None):
    L = ledger.load()
    return {"balances": {k: _money(v) for k, v in L["balances"].items()},
            "card_limit": L["card_limit"],
            "bills": [{"id": b["id"], "payee": b["payee"], "amount": b["amount"], "next": b["next"].isoformat(),
                       "account": b["account"]} for b in L["bills"] if b["status"] != "cancelled"],
            "loans": [{"type": l["type"], "balance": l["amount"], "monthly": l["monthly_payment"], "apr": l["apr"]}
                      for l in L["loans"]],
            "bnpl": [{"item": b["item"], "amount": b["amount"], "due": b["due"].isoformat()}
                     for b in L["bnpl"] if not b["paid"]]}


def get_cashflow(customer_id=None, months=3):
    L = ledger.load()
    since = L["today"] - timedelta(days=30 * months)
    by_cat = {}
    for t in L["tx"]:
        if t["date"] >= since and _is_spend(t) and t["kind"] != "one_time":  # deposit/furniture aren't monthly
            by_cat[t["category"]] = by_cat.get(t["category"], 0) - t["amount"]
    income = sum(_monthly(L, _is_income, months)) / months
    return {"months": months, "income_per_month": _money(income),
            "spend_per_month": {k: _money(v / months) for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1])}}


def _lin(x, zero_at, full_at):
    """Linear 0..25, capped. Works for both directions."""
    f = (x - zero_at) / (full_at - zero_at)
    return round(float(25 * min(1.0, max(0.0, f))), 1)


def _next_30(L):
    """Projected next 30 days (future first): income, spend, debt payments, savings and card balance at day 30."""
    ev = _fixed_events(L, 30)
    items = [(lab, a) for d in ev.values() for lab, a in d]
    income = sum(a for lab, a in items if a > 0)
    debt_labels = {"Metro Auto Finance", "Card Payment"}
    debt = -sum(a for lab, a in items if lab in debt_labels or lab.startswith("Pay-later"))
    card_pay = -sum(a for lab, a in items if lab == "Card Payment")
    checking_fixed = -sum(a for lab, a in items if a < 0 and lab not in ("Card Payment", "Autopilot save"))
    card_bills = sum(b["amount"] for b in L["bills"] if b["account"] == "card" and b["status"] != "cancelled"
                     and (b["next"] - L["today"]).days <= 30)
    var_check = -_variable_pool(L).mean() * 30
    var_card = -_variable_pool(L, "card").mean() * 30
    saved = sum(r["amount"] * 30 / 7 for r in L["rules"] if r["kind"] == "save_weekly")
    spend = checking_fixed + card_bills + var_check + var_card
    return {"income": income, "spend": spend, "debt": debt, "savings": L["balances"]["savings"] + saved,
            "card_owed": -L["balances"]["card"] + card_bills + var_card - card_pay}


def health_score(customer_id=None, L=None):
    L = L or ledger.load()
    p = _next_30(L)
    income, spend = p["income"], p["spend"]
    cushion_months = p["savings"] / spend if spend else 0
    debt_ratio = p["debt"] / income if income else 1
    save_rate = (income - spend) / income if income else 0
    card_full = max(0.0, p["card_owed"]) / L["card_limit"]
    ind = {
        "safety_cushion": {"points": _lin(cushion_months, 0, 6), "value": round(float(cushion_months), 2),
                           "why": f"Savings cover {cushion_months:.1f} months of spending. 6 months is the goal."},
        "pay_to_debt": {"points": _lin(debt_ratio, 0.5, 0.2), "value": round(float(debt_ratio), 3),
                        "why": f"{debt_ratio:.0%} of your pay goes to loans, card, and pay-later. 20% or less is great."},
        "savings_rate": {"points": _lin(save_rate, 0, 0.2), "value": round(float(save_rate), 3),
                         "why": f"You keep {max(save_rate, 0):.0%} of what you earn. 20% is the goal."},
        "card_fullness": {"points": _lin(card_full, 0.9, 0.1), "value": round(float(card_full), 3),
                          "why": f"Your card is {card_full:.0%} full. Under 30% helps your credit."},
    }
    return {"score": round(sum(i["points"] for i in ind.values())), "indicators": ind}


# ---------- PREDICT ----------

def _fixed_events(L, days):
    """Exact-date checking events: paychecks, checking bills, pay-later installments."""
    today, ev = L["today"], {}
    pays = sorted(t["date"] for t in L["tx"] if _is_income(t))
    if pays:
        d = pays[-1] + timedelta(days=14)
        while d <= today + timedelta(days=days):
            ev.setdefault(d, []).append(("Paycheck", L["pay"]))
            d += timedelta(days=14)
    for b in L["bills"]:
        if b["account"] != "checking" or b["status"] == "cancelled":
            continue
        d = b["next"]
        while d <= today + timedelta(days=days):
            if d > today:
                ev.setdefault(d, []).append((b["payee"], -b["amount"]))
            d = _add_month(d, b["day"])
    for b in L["bnpl"]:
        if not b["paid"] and today < b["due"] <= today + timedelta(days=days):
            ev.setdefault(b["due"], []).append((f"Pay-later: {b['item']}", -b["amount"]))
    for r in L["rules"]:
        if r["kind"] == "save_weekly":
            start = date.fromisoformat(r["start"]) if r.get("start") else today + timedelta(days=7)
            d = start
            while d <= today + timedelta(days=days):
                if d > today:
                    ev.setdefault(d, []).append(("Autopilot save", -r["amount"]))
                d += timedelta(days=7)
    return ev


def _add_month(d, day):
    nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nxt.replace(day=min(day, 28))


def _variable_pool(L, account="checking"):
    """Past daily variable spend on one account, including zero days (bootstrap source)."""
    today, per_day = L["today"], {}
    for t in L["tx"]:
        if t["account"] == account and t["kind"] == "purchase" and t["merchant"] not in L["blocked"]:
            per_day[t["date"]] = per_day.get(t["date"], 0) + t["amount"]
    return np.array([per_day.get(today - timedelta(days=i), 0.0) for i in range(1, 91)])


def forecast(customer_id=None, days=60, L=None, change=None):
    L = L or ledger.load()
    ev = _fixed_events(L, days)
    if (change or {}).get("no_income"):
        ev = {d: [(lab, a) for lab, a in items if lab != "Paycheck"] for d, items in ev.items()}
    for d, label, amt in (change or {}).get("events", []):
        ev.setdefault(d, []).append((label, amt))
    start = L["balances"]["checking"] + (change or {}).get("start_delta", 0)
    daily_scale = (change or {}).get("variable_scale", 1.0)
    rng = np.random.default_rng(7)
    pool = _variable_pool(L)
    var = rng.choice(pool, size=(RUNS, days)) * daily_scale
    fixed = np.array([sum(a for _, a in ev.get(L["today"] + timedelta(days=i + 1), [])) for i in range(days)])
    paths = start + np.cumsum(var + fixed, axis=1)
    p10, p50, p90 = np.percentile(paths, [10, 50, 90], axis=0)
    dates = [L["today"] + timedelta(days=i + 1) for i in range(days)]
    below = np.nonzero(p50 < BUFFER)[0]
    safe_until = dates[below[0]] - timedelta(days=1) if len(below) else None
    low = int(np.argmin(p50))
    return {
        "safe_until": safe_until.isoformat() if safe_until else None,
        "why": (f"Your balance may drop under ${BUFFER:.0f} on {dates[below[0]]:%b %-d}." if len(below)
                else f"Your balance stays above ${BUFFER:.0f} for the next {days} days."),
        "lowest": {"date": dates[low].isoformat(), "balance": _money(p50[low])},
        "days": [{"date": d.isoformat(), "p10": _money(a), "p50": _money(b), "p90": _money(c)}
                 for d, a, b, c in zip(dates, p10, p50, p90)],
        "markers": [{"date": d.isoformat(), "label": lab, "amount": _money(a)}
                    for d, items in sorted(ev.items()) for lab, a in items],
    }


def what_if(customer_id=None, change=None):
    """change: {"start_delta": +200, "variable_scale": 0.9, "events": [(date, label, amount)]}"""
    L = ledger.load()
    a, b = forecast(L=L), forecast(L=L, change=change)
    return {"current": {"safe_until": a["safe_until"], "lowest": a["lowest"], "days": [d["p50"] for d in a["days"]]},
            "new": {"safe_until": b["safe_until"], "lowest": b["lowest"], "days": [d["p50"] for d in b["days"]]},
            "dates": [d["date"] for d in a["days"]]}


def purchase_impact(customer_id=None, amount=0.0):
    L = ledger.load()
    a, b = forecast(L=L), forecast(L=L, change={"start_delta": -amount})
    ok = b["lowest"]["balance"] >= BUFFER
    return {"amount": amount, "safe_until_now": a["safe_until"], "safe_until_after": b["safe_until"],
            "lowest_after": b["lowest"], "fits": ok,
            "why": ("This fits and keeps you above $100." if ok else
                    f"This would take you to {'-' if b['lowest']['balance'] < 0 else ''}${abs(b['lowest']['balance']):,.0f} "
                    f"on {date.fromisoformat(b['lowest']['date']):%b %-d}.")}


def save_for_goal(customer_id=None, amount=0.0, by_date=None):
    """Weekly amount to reach `amount` by `by_date`, and what a weekly autopilot save does to the forecast."""
    import copy
    import math
    L = ledger.load()
    by = date.fromisoformat(by_date) if by_date else L["today"] + timedelta(days=120)
    a = forecast(L=L)
    # Start next week; if that dips below $0, start the week after the lowest point (e.g. after rent clears).
    for start in (L["today"] + timedelta(days=7), date.fromisoformat(a["lowest"]["date"]) + timedelta(days=3)):
        weeks = max(1, (by - start).days // 7 + 1)
        weekly = float(math.ceil(amount / weeks / 5) * 5)  # round up to $5
        trial = copy.deepcopy(L)
        trial["rules"].append({"kind": "save_weekly", "amount": weekly, "start": start.isoformat(), "id": "preview"})
        b = forecast(L=trial)
        if b["lowest"]["balance"] >= 0:
            break
    return {"goal": _money(amount), "by": by.isoformat(), "start": start.isoformat(), "weeks": weeks, "weekly": weekly,
            "safe_until_now": a["safe_until"], "safe_until_with_plan": b["safe_until"],
            "lowest_with_plan": b["lowest"], "why": f"${amount:,.0f} over {weeks} weeks is ${weekly:.0f} a week."}


# ---------- LEAKS / BUDGET / DEBT ----------

def find_leaks(customer_id=None):
    L = ledger.load()
    today, leaks = L["today"], []
    for b in L["bills"]:
        if b["account"] != "card" or b["status"] == "cancelled":
            continue
        past = sorted((t["date"], -t["amount"]) for t in L["tx"] if t["merchant"] == b["payee"])
        item = {"bill_id": b["id"], "merchant": b["payee"], "amount": b["amount"], "yearly": _money(b["amount"] * 12)}
        if b.get("trial"):
            leaks.append(item | {"type": "trial_converting", "date": b["next"].isoformat(),
                                 "why": f"Free trial turns into ${b['amount']:.2f}/month on {b['next']:%b %-d}."})
        elif not b.get("used", True):
            leaks.append(item | {"type": "unused", "why": "You pay for this every month but haven't used it lately."})
        elif len(past) >= 2 and past[-1][1] > past[0][1] + 0.01:
            leaks.append(item | {"type": "price_jump", "old": past[0][1],
                                 "why": f"Went from ${past[0][1]:.2f} to ${past[-1][1]:.2f}."})
    leaks.sort(key=lambda x: -x["amount"])
    return {"leaks": leaks, "monthly_total": _money(sum(x["amount"] for x in leaks)),
            "yearly_total": _money(sum(x["yearly"] for x in leaks)), "as_of": today.isoformat()}


def savings_target(customer_id=None):
    """What to save a month: 20% of the next 30 days' pay, vs what she keeps now."""
    p = _next_30(ledger.load())
    target, now = p["income"] * 0.2, max(0.0, p["income"] - p["spend"])
    return {"income": _money(p["income"]), "target": _money(target), "now": _money(now),
            "gap": _money(max(0.0, target - now)), "why": "20% of take-home pay is a common goal."}


# ---------- DAILY BRIEF (Watcher, no prompt needed) ----------

def daily_brief(customer_id=None):
    """Three short cards: subscriptions overview, today's money update, today's spend limit."""
    import persona
    L, today = ledger.load(), ledger.load()["today"]

    subs = [b for b in L["bills"] if b["account"] == "card" and b["status"] != "cancelled"
            and persona.MERCHANTS.get(b["payee"]) == "subscription"]
    paying = [b for b in subs if not b.get("trial")]
    unused = [b for b in paying if not b.get("used", True)]
    trial = next((b for b in subs if b.get("trial")), None)
    monthly = _money(sum(b["amount"] for b in paying))
    bits = ([f"{len(unused)} unused (${sum(b['amount'] for b in unused):.0f}/mo)"] if unused else []) + \
           ([f"trial ends {trial['next']:%b %-d}"] if trial else [])
    subscriptions = {"title": f"{len(paying)} subscriptions · ${monthly:,.0f}/month", "line": " · ".join(bits) or "All in use.",
                     "level": "watch" if unused or trial else "good", "count": len(paying), "monthly": monthly,
                     "items": [{"name": b["payee"], "amount": b["amount"], "unused": not b.get("used", True)} for b in paying],
                     "link": "/plan#leaks"}

    bal = L["balances"]
    invest = sum(a["balance"] for a in persona.INVESTMENTS)
    total = _money(bal["checking"] + bal["savings"] + invest + bal["card"])  # card is negative (owed)
    change = _money(sum(t["amount"] for t in L["tx"] if t["date"] == today and t["kind"] != "transfer"))
    f = forecast(L=L)
    sign = "+" if change >= 0 else "−"
    update = {"title": f"All your money: ${total:,.2f}", "line": f"Today {sign}${abs(change):,.0f} · Safe until {_short(f['safe_until'])}",
              "level": "good" if f["lowest"]["balance"] >= 0 else "watch",  # info card: never louder than the real alerts
              "total": total, "change_today": change,
              "net_worth": _money(total - sum(l["amount"] for l in L["loans"]) - sum(b["amount"] for b in L["bnpl"] if not b["paid"])),
              "parts": {"Checking": _money(bal["checking"]), "Savings": _money(bal["savings"]),
                        "Investments": _money(invest), "Card owed": _money(-bal["card"])},
              "why": "Checking + savings + investments − card owed. Today = money in minus money out today.",
              "link": "/"}

    ev = _fixed_events(L, 30)
    payday = min((d for d, items in ev.items() if any(lab == "Paycheck" for lab, _ in items)), default=today + timedelta(days=14))
    days = max(1, (payday - today).days)
    bills = sum(a for d, items in ev.items() if d < payday for lab, a in items if a < 0)
    spent = _money(-sum(t["amount"] for t in L["tx"] if t["date"] == today and t["kind"] == "purchase" and t["amount"] < 0))
    room = bal["checking"] + spent - BUFFER + bills  # spent added back: the limit is for the whole day
    limit = max(0, int(room / days))
    left = _money(limit - spent)
    limit_card = {"title": f"Spend up to ${limit:,} today" if limit else "Try a no-spend day",
                  "line": f"Spent ${spent:,.0f} · " + (f"${left:,.0f} left" if left >= 0 else f"${-left:,.0f} over"),
                  "level": "good" if left >= 0 and limit else "act" if left < 0 else "watch",
                  "limit": limit, "spent": spent, "left": left, "payday": payday.isoformat(),
                  "why": f"Checking minus bills due before payday ({payday:%b %-d}) and a $100 cushion, split over {days} days.",
                  "link": "/plan#budget"}
    return {"date": today.isoformat(), "cards": {"subscriptions": subscriptions, "update": update, "limit": limit_card}}


def _short(iso):
    return date.fromisoformat(iso).strftime("%b %-d") if iso else "60+ days"


FIXED_CATS = {"rent", "loan", "phone", "utilities", "card_payment", "bnpl", "subscription"}


def build_budget(customer_id=None, goal=None):
    """Median of the last 3 months per category. goal: {"monthly_saving": 480} -> trims flexible categories."""
    L = ledger.load()
    regular = lambda t: _is_spend(t) and t["kind"] != "one_time"  # one-off costs don't set a monthly plan
    cats = {t["category"] for t in L["tx"] if regular(t)}
    lines = {c: median([-s for s in _monthly(L, lambda t, c=c: regular(t) and t["category"] == c)]) for c in cats}
    income = median(_monthly(L, _is_income))
    save = (goal or {}).get("monthly_saving", 0)
    flex = {c: v for c, v in lines.items() if c not in FIXED_CATS}
    gap = max(0.0, sum(lines.values()) + save - income)
    trim = min(1.0, gap / sum(flex.values())) if flex and gap else 0.0
    budget = [{"category": c, "monthly": _money(v * (1 - trim) if c in flex else v), "fixed": c in FIXED_CATS}
              for c, v in sorted(lines.items(), key=lambda kv: -kv[1])]
    fixed = sum(b["monthly"] for b in budget if b["fixed"])
    flexible = sum(b["monthly"] for b in budget if not b["fixed"])
    return {"income": _money(income), "savings_first": save, "lines": budget,
            "fixed_total": _money(fixed), "flexible_total": _money(flexible),
            "left_over": _money(income - fixed - flexible - save),
            "why": "Based on your middle month of the last 3, so one odd month doesn't skew it."}


def budget_pace(customer_id=None):
    L = ledger.load()
    today = L["today"]
    start = today.replace(day=1)
    month_days = (_add_month(start, 1) - start).days
    passed = (today - start).days / month_days
    spent = {}
    for t in L["tx"]:
        if t["date"] >= start and _is_spend(t) and t["kind"] != "one_time":
            spent[t["category"]] = spent.get(t["category"], 0) - t["amount"]
    out = []
    for line in build_budget()["lines"]:
        if line["fixed"]:
            continue
        used = spent.get(line["category"], 0) / line["monthly"] if line["monthly"] else 0
        status = "good" if used <= passed + 0.1 else "watch" if used <= passed + 0.25 else "act"
        out.append({"category": line["category"], "plan": line["monthly"], "spent": _money(spent.get(line["category"], 0)),
                    "used": round(used, 2), "status": status})
    plan, used_total = sum(c["plan"] for c in out), sum(c["spent"] for c in out)
    return {"month_passed": round(passed, 2), "categories": out, "month_pct": round(passed * 100),
            "plan_total": _money(plan), "spent_total": _money(used_total),
            "spent_pct": round(used_total / plan * 100) if plan else 0}


def upcoming_dues(customer_id=None, days=30):
    """Debt payments due in the next `days`: loan, card, pay-later."""
    L = ledger.load()
    ev = _fixed_events(L, days)
    names = {"Metro Auto Finance": "Auto loan", "Card Payment": "Credit card"}
    dues = sorted(({"date": d.isoformat(), "name": names.get(lab, lab.replace("Pay-later: ", "Pay-later · ")),
                    "amount": _money(-a)} for d, items in ev.items() for lab, a in items
                   if lab in names or lab.startswith("Pay-later")), key=lambda x: x["date"])
    owed = [{"name": "Auto loan", "balance": l["amount"], "apr": l["apr"]} for l in L["loans"]]
    owed.append({"name": "Credit card", "balance": _money(-L["balances"]["card"]), "apr": L["card_apr"]})
    left = [b for b in L["bnpl"] if not b["paid"]]
    if left:
        owed.append({"name": f"Pay-later · {left[0]['item']}", "balance": _money(sum(b["amount"] for b in left)), "apr": 0})
    return {"dues": dues, "total_due": _money(sum(x["amount"] for x in dues)), "owed": owed,
            "total_owed": _money(sum(x["balance"] for x in owed))}


def card_overview(customer_id=None, days=30):
    """Card fullness plus where card money went in the last `days`."""
    L = ledger.load()
    since = L["today"] - timedelta(days=days)
    cats, merch = {}, {}
    for t in L["tx"]:
        if t["account"] == "card" and t["date"] >= since and t["amount"] < 0 and t["kind"] != "transfer":
            cats[t["category"]] = cats.get(t["category"], 0) - t["amount"]
            merch[t["merchant"]] = merch.get(t["merchant"], 0) - t["amount"]
    owed = -L["balances"]["card"]
    pay = next((b for b in L["bills"] if b["payee"] == "Card Payment" and b["status"] != "cancelled"), None)
    return {"owed": _money(owed), "limit": L["card_limit"], "used": round(owed / L["card_limit"], 3),
            "available": _money(L["card_limit"] - owed), "apr": L["card_apr"],
            "next_payment": {"date": pay["next"].isoformat(), "amount": pay["amount"]} if pay else None,
            "categories": [{"category": k, "amount": _money(v)} for k, v in sorted(cats.items(), key=lambda kv: -kv[1])],
            "top_merchants": [{"merchant": k, "amount": _money(v)} for k, v in sorted(merch.items(), key=lambda kv: -kv[1])[:4]],
            "why": "Keeping your card under 30% full helps your credit score.",
            "credit": credit_score(L, owed)}


def credit_score(L, owed):
    """Score from the auto-loan application on file (Nessie loan credit_score); factors are plain-word guidance."""
    import persona
    score = int(next((l.get("credit_score") for l in L["loans"] if l.get("credit_score")), persona.LOAN["credit_score"]))
    band = ("Poor" if score < 580 else "Fair" if score < 670 else "Good" if score < 740 else
            "Very good" if score < 800 else "Excellent")
    used = round(owed / L["card_limit"] * 100)
    return {"score": score, "band": band, "min": 300, "max": 850,
            "level": "good" if score >= 670 else "watch" if score >= 580 else "act",
            "factors": [{"name": "Card use", "value": f"{used}% full", "level": "good" if used <= 30 else "watch",
                         "tip": f"Pay down ${max(0, owed - L['card_limit'] * 0.3):,.0f} to get under 30%." if used > 30 else "Nice, keep it under 30%."},
                        {"name": "On-time payments", "value": "All on time", "level": "good", "tip": "The biggest part of your score. Keep autopay on."},
                        {"name": "Credit age", "value": "Short", "level": "watch", "tip": "Normal at 24. Keep your oldest card open."}],
            "why": "From your auto-loan application. Card use is the part you can change fastest."}


ASSUMED_RETURN = 0.04  # education only: long-run return after inflation (today's dollars), stated wherever used


def investments_overview(customer_id=None):
    """Investment balances and general, rules-based next steps. Educational, never product picks."""
    import persona
    L = ledger.load()
    accts = [dict(a) for a in persona.INVESTMENTS]
    k = next(a for a in accts if a["kind"] == "401k")
    gross = persona.GROSS_ANNUAL
    match_gap = max(0, k["match_pct"] - k["contribution_pct"]) / 100 * gross
    spend = _next_30(L)["spend"]
    cushion = float(L["balances"]["savings"] / spend) if spend else 0.0
    yearly_in = (k["contribution_pct"] + min(k["contribution_pct"], k["match_pct"])) / 100 * gross
    total = sum(a["balance"] for a in accts)
    years = 65 - persona.AGE
    fv = total * (1 + ASSUMED_RETURN) ** years + yearly_in * (((1 + ASSUMED_RETURN) ** years - 1) / ASSUMED_RETURN)
    fv_full = fv + match_gap * 2 * (((1 + ASSUMED_RETURN) ** years - 1) / ASSUMED_RETURN)
    steps = [
        {"id": "cushion", "title": "Build a 1-month safety cushion", "done": cushion >= 1,
         "why": f"Your cushion covers {cushion:.1f} months. A small cushion first keeps surprises off your card."},
        {"id": "match", "title": f"Get your full employer match ({k['match_pct']}%)", "done": match_gap == 0,
         "why": f"You put in {k['contribution_pct']}%. Going to {k['match_pct']}% adds ${match_gap:,.0f} a year from you "
                f"and the same again from your employer."},
        {"id": "card", "title": "Pay down your card before investing more", "done": L["balances"]["card"] >= 0,
         "why": f"Your card costs {L['card_apr']}% a year. Paying it off is a sure return, markets are not."},
    ]
    nxt = next((s["id"] for s in steps if not s["done"]), None)
    # "If you do X today": one action, one outcome each. All numbers computed here.
    import math
    weekly = 100.0
    goal = 1 if cushion < 1 else 3  # next milestone: 1 month, then 3 months
    weeks = max(1, math.ceil(max(0.0, goal * spend - L["balances"]["savings"]) / weekly))
    unused = [x for x in find_leaks()["leaks"] if x["type"] in ("unused", "trial_converting")]
    moves = []
    if match_gap:
        moves.append({"id": "match", "do": f"Raise your 401(k) to {k['match_pct']}%", "cost": f"${match_gap / 12:,.0f}/month",
                      "outcome": f"+${fv_full - fv:,.0f}", "outcome_note": "more by age 65"})
    if unused:
        moves.append({"id": "leaks", "do": f"Cancel {len(unused)} charges you don't use", "cost": "Takes 1 tap",
                      "outcome": f"+${sum(x['yearly'] for x in unused):,.0f}", "outcome_note": "back to you each year"})
    if cushion < 3:
        moves.append({"id": "cushion", "do": f"Save ${weekly:.0f} a week", "cost": f"${weekly:.0f}/week",
                      "outcome": f"{weeks} weeks", "outcome_note": f"to a {goal}-month safety cushion"})
    return {"accounts": [{"name": a["name"], "balance": a["balance"], "holding": a["holding"]} for a in accts],
            "total": _money(total), "steps": steps, "next_step": nxt, "moves": moves,
            "free_money_missed": _money(match_gap),
            "projection": {"age": 65, "assumed_return": ASSUMED_RETURN, "today_plan": round(fv, -2),
                           "with_full_match": round(fv_full, -2),
                           "why": f"In today's dollars, assuming {ASSUMED_RETURN:.0%} a year after inflation. "
                                  f"Not guaranteed: real returns go up and down."},
            "disclaimer": "General education, not investment advice."}


def debt_plan(customer_id=None, extra=0.0):
    L = ledger.load()
    true_min = max(25.0, 0.02 * -L["balances"]["card"])
    pay = next((b["amount"] for b in L["bills"] if b["payee"] == "Card Payment" and b["status"] != "cancelled"), true_min)
    debts = [{"name": "Credit card", "balance": -L["balances"]["card"], "apr": L["card_apr"], "min": max(pay, true_min)}]
    debts += [{"name": f"{l['type'].title()} loan", "balance": l["amount"], "apr": l["apr"], "min": l["monthly_payment"]}
              for l in L["loans"]]
    plans = {"avalanche": _payoff(debts, extra, key=lambda d: -d["apr"]),
             "snowball": _payoff(debts, extra, key=lambda d: d["balance"]),
             "plus_100": _payoff(debts, extra + 100, key=lambda d: -d["apr"])}
    plans["same_order"] = plans["avalanche"]["order"] == plans["snowball"]["order"]
    card = debts[0]
    min_only = _payoff([card | {"min": true_min}], 0, key=lambda d: 0)
    plans["extra_per_month"] = 100.0
    plans["saved_with_100"] = _money(plans["avalanche"]["interest"] - plans["plus_100"]["interest"])
    return plans | {"minimum_trap": {"months": min_only["months"], "interest": min_only["interest"],
                                     "why": f"Paying only the minimum on the card takes {_span(min_only['months'])} "
                                            f"and costs ${min_only['interest']:,.0f} in interest."}}


def _span(months):
    return f"{months} months" if months < 24 else f"about {round(months / 12)} years"


def _payoff(debts, extra, key):
    ds = [dict(d) for d in debts]
    month, interest, order = 0, 0.0, []
    while any(d["balance"] > 0.005 for d in ds) and month < 600:
        month += 1
        pool = extra
        for d in ds:
            if d["balance"] > 0:
                i = d["balance"] * d["apr"] / 100 / 12
                interest += i
                d["balance"] += i
        for d in ds:
            pay = min(d["min"], d["balance"])
            d["balance"] -= pay
            pool += d["min"] - pay
        for d in sorted((d for d in ds if d["balance"] > 0), key=key):
            pay = min(pool, d["balance"])
            d["balance"] -= pay
            pool -= pay
        for d in ds:
            if d["balance"] <= 0.005 and d["name"] not in order:
                order.append(d["name"])
    payoff = L_today() + timedelta(days=30 * month)
    return {"months": month, "interest": _money(interest), "debt_free": payoff.isoformat(), "order": order}


def L_today():
    return ledger.load()["today"]


# ---------- ACT (money moves only after user approval; caller enforces) ----------

def transfer(from_acct, to_acct, amount, memo="Transfer"):
    return ledger.transfer(from_acct, to_acct, amount, memo)


def cancel_bill(bill_id):
    return ledger.cancel_bill(bill_id)


def create_bill(account, payee, amount, day):
    return ledger.create_bill(account, payee, amount, day)


def block_merchant(merchant):
    return ledger.block_merchant(merchant)


def create_rule(rule: dict):
    return ledger.create_rule(rule)


DRAFTS = {
    "cancel": "Hi {merchant} team,\n\nPlease cancel my subscription effective today and confirm by email. "
              "Please don't charge me again.\n\nThanks,\nMaya",
    "fee_waiver": "Hi,\n\nI was charged a {merchant} fee. I've been a customer in good standing and would "
                  "appreciate a one-time waiver.\n\nThank you,\nMaya",
    "dispute": "Hi,\n\nI don't recognize a charge from {merchant} for ${amount}. Please investigate and "
               "reverse it if it's not valid.\n\nThanks,\nMaya",
}


def draft_message(type, merchant="", amount=""):
    if type not in DRAFTS:
        return {"error": f"unknown type, use one of {list(DRAFTS)}"}
    return {"type": type, "text": DRAFTS[type].format(merchant=merchant, amount=amount)}
