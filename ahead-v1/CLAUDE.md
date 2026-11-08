# Ahead

AI money assistant. "Your money, a little clearer." Sees all your money, predicts trouble, and fixes it before it happens. The user always approves first. One line: "Banks show your past. Ahead shows what's next."

## Why

- Only 63% of US adults can cover a $400 surprise without borrowing (Fed SHED, May 2026).
- Over $12B in overdraft/NSF fees paid in 2025 (NCLC).
- Only 14% feel in control of their finances.
- 47% of BNPL users paid late in the past year (LendingTree 2026).
- Money is scattered (checking, savings, cards, loans, BNPL). Banking apps show the past, not the future.

## Persona (all demo data is built around her)

Maya, 24, first job, biweekly paycheck, $1,100 rent, auto loan, credit card near max, $400 savings, 6 subscriptions (2 unused, 1 price jump), 1 BNPL plan, one free trial about to convert. Starting health score about 58. Overdraft risk before next rent.

## Core idea: 3 pillars

1. SEE: all money in one place
2. PREDICT: forecast and "safe until" date
3. ACT: agent fixes problems with one tap or one "yes", after user approval

## Principles (follow in every feature)

1. Future first
2. Warn early, before the problem
3. Act, don't just advise: every alert comes with a fix
4. User approves every money move
5. Simple: one number, one next step
6. Python does all math. LLM only plans and explains.
7. Every number has a one-line "why"
8. No shame: calm, kind wording
9. Whole picture, including BNPL and outside accounts
10. Safe by default: block risky advice, keep data private

Pitch version: "See ahead. Warn early. Fix fast. You stay in control."

## Hackathon tracks

- PNC "360° Financial Health Navigator": full picture, 3+ health indicators, forecast, what-if, conversational coach, confident next move. Cover all 6 products: Checking, Savings, CDs & IRAs, Loans, Credit Cards, Mortgages.
- NVIDIA "Nemotron beyond a chatbot": proactive, multi-step, tool use, real problem. Voice, reasoning, and safety all run on Nemotron.
- Capital One "Best use of Nessie": Nessie read AND write.
- Gemini and Tiger Data sponsor prizes if offered.

## Stack and roles

- backend/: FastAPI (Python 3.11), pandas, numpy, ffmpeg
- frontend/: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + framer-motion + Recharts + Lucide icons
- Bank: Capital One Nessie API (http://api.nessieisreal.com, key as ?key=)
- Memory: Tiger Data (Postgres + TimescaleDB hypertables, continuous aggregates, pgvector)
- Brain: NVIDIA Nemotron via build.nvidia.com (OpenAI-compatible, base_url https://integrate.api.nvidia.com/v1). Check exact model IDs on build.nvidia.com.
- Voice: NVIDIA Nemotron Speech (ASR + TTS + NMT) on build.nvidia.com. Fallback: browser Web Speech API.
- Eyes: Gemini (google-genai) for photos, PDFs, screenshots only. Never planning or money decisions.
- All keys in .env only. Never hardcode. Never print keys.

## Agent design (Nemotron team)

- Planner (Nemotron Super, reasoning ON): reads goal or event, plans steps, calls tools, writes answer
- Worker (Nemotron Nano, reasoning OFF): categorizes transactions, detects recurring charges
- Critic (Nano): re-checks every number in the answer against tool outputs. Max 2 retries. Show "Verified" badge.
- Guard (Nemotron safety model): blocks risky or harmful advice and prompt injection
- Watcher (proactive): creates alert cards with no user prompt. Triggers: /simulate-week, /upload, /approve. No background timer.
- Every run saves a trace (plan, tool calls, results, critic check, time) shown as "How I figured this out".
- Agent steps stream to the frontend with Server-Sent Events (GET /ask/stream).
- Money actions need explicit approval (tap or voice "yes").
- Flow: input (text or voice) -> Guard -> Planner -> tools -> Workers -> Critic -> answer -> approval -> Nessie action -> ledger update -> Watcher

## Tools (backend/tools.py, pure Python, unit tested)

- get_snapshot(customer_id): accounts, balances, bills, loans, BNPL
- get_cashflow(customer_id, months): income vs spend by category
- health_score(customer_id): 4 indicators -> 0 to 100 with reasons
- forecast(customer_id, days=60): daily balance, safe-until date, Monte Carlo band
- what_if(customer_id, change): same forecast with one change, returns both lines
- find_leaks(customer_id): recurring charges, unused subs, price jumps, trials converting, duplicates, fees
- build_budget(customer_id, goal=None): median of last 3 months per category, fixed vs flexible, savings first
- budget_pace(customer_id): % used vs % of month passed per category
- debt_plan(customer_id): avalanche vs snowball with payoff dates, minimum-payment trap
- purchase_impact(customer_id, amount): effect of a purchase on safe-until date
- transfer(from, to, amount), cancel_bill(bill_id), create_bill(...): Nessie writes, mirrored to ledger
- block_merchant(merchant_id): app-level rule, flag future charges
- create_rule(rule): autopilot rules ("save $120 every week", "keep checking above $200")
- draft_message(type): cancel email, fee waiver, dispute

## Exact math

- Safe-until date = first day the MEDIAN forecast balance drops below a $100 buffer.
- Uncertainty band = 10th to 90th percentile from 1,000 runs.
- Monte Carlo input = resample Maya's real past daily variable spend (bootstrap). Fixed bills and paychecks are placed on their exact dates.
- Health score: 4 indicators, each 0 to 25, linear, capped:
  - Safety cushion (savings / median monthly spend): 0 months = 0, 6+ months = 25
  - Pay going to debt (debt + bill payments / income): 50%+ = 0, 20% or less = 25
  - Savings rate ((income - spend) / income): 0% or less = 0, 20%+ = 25
  - How full your card is (balance / stored limit): 90%+ = 0, 10% or less = 25
  - Nessie has no credit limit, store it in our DB.
- Budget uses medians, not averages.
- Demo numbers come from the seed. Tune the seed until: start score about 58, overdraft alert before next rent, after Approve score about 71 and safe date clearly later.
- All dates are relative to today. Never hardcode calendar dates.

## Features

Core (must work perfectly):

1. Safe-until date (hero number)
2. Health score rings
3. 60-day forecast with uncertainty band and bill markers
4. Proactive alerts (going below $0, bill before payday)
5. What-if with two lines (current vs new)
6. One-tap fix -> real Nessie transfer -> score and date update live
7. Money leaks: subscription detective + cancel (Nessie bill cancel + block merchant + drafted cancel email) + money-saved counter
8. Voice assistant on Nemotron Speech (see Voice section)
9. AI budget from past history: linked to forecast, pace alerts, weekly self-adjust, goal-based

Extras (in this order if time):

10. Gemini upload: bills, receipts, PDF statements, BNPL screenshots -> JSON -> Nessie / ledger
11. "Should I buy this?": photo of price -> impact on safe-until date
12. Speaks your language (Nemotron NMT: Hindi, Spanish)
13. Payday autopilot + autopilot rules
14. Minimum trap, job loss survival mode, idle cash alert, debt payoff plan, weekly check-in
15. Unusual charge alert, fee fighter, upcoming spend radar

Product coverage map: Checking (alerts, bill timing), Savings (cushion, idle cash), CDs & IRAs (future you), Loans (payoff plan), Credit Cards (minimum trap, card fullness), Mortgages (home readiness, roadmap).

## Scope (24h reality)

- MVP must-have: features 1 to 8. Budget (9) next.
- Extras only after the full demo flow works twice in a row.
- Hard cut at hour 18: no new features after that, only polish and bug fixes.

## Voice assistant (CORE)

Full NVIDIA pipeline: Nemotron Speech ASR -> Nemotron planner -> Nemotron Speech TTS.

Models (Nemotron Speech, formerly Riva, on build.nvidia.com):

- ASR: nemotron-asr-streaming (English). Parakeet as backup.
- TTS: Magpie TTS (one calm, friendly voice).
- NMT: Nemotron NMT for other languages.
- Client: pip install nvidia-riva-client. gRPC server grpc.nvcf.nvidia.com:443 with SSL. Metadata: function-id (from each model's /api page) + "authorization: Bearer $NVIDIA_API_KEY".
- .env: ASR_FUNCTION_ID, TTS_FUNCTION_ID, NMT_FUNCTION_ID.

Flow:

1. User holds the mic button (push-to-talk, no wake word).
2. Browser records audio (MediaRecorder) -> POST /voice.
3. Backend converts webm -> 16kHz 16-bit mono WAV with ffmpeg.
4. Nemotron ASR -> text. Show live transcript.
5. Text -> Guard -> Planner (same agent, tools, and trace as chat).
6. Planner returns spoken_text (max 2 sentences) + screen payload (chart, numbers, buttons).
7. Nemotron TTS -> audio -> play in browser while the screen updates.
8. Non-English: NMT translates in and out.

Rules:

- Spoken answer max 2 sentences. Details on screen.
- Money actions need voice confirm: "Move $200 to savings. Say yes to confirm." Only "yes" / "confirm" counts. Anything else cancels.
- Never speak account numbers.
- States: "Listening...", "Thinking...", "Speaking..." with a soft waveform. Tap to stop.

Reliability:

- Timeout 8s per speech call, 3 retries with backoff.
- Fallback ASR: browser Web Speech API. Fallback TTS: browser speechSynthesis.
- Needs HTTPS or localhost plus mic permission. Test on the demo laptop in a noisy room.

## Data and source of truth

- Single demo user: Maya. customer_id in .env. No login.
- backend/seed.py: create Maya in Nessie with 3 months of history matching the persona. Deterministic (fixed random seed).
- backend/sync.py: Nessie -> Tiger Data (transactions hypertable, bills, loans, bnpl, alerts, traces, rules, budgets, credit_limits, blocked_merchants).
- Tiger ledger is the source of truth for balances. Nessie writes are mirrored into the ledger.
- Cache every Nessie response to backend/cache/*.json. If Nessie fails or takes over 3s, use the cache.
- backend/reset_demo.py: delete Maya's Nessie data, reseed, rebuild Tiger tables, clear alerts/traces/rules. Must finish under 60s. Keep a JSON snapshot fallback.
- Nessie is a sandbox. Real subscription cancel is simulated by bill cancel + merchant block. Pitch line: "In a real bank this connects to virtual card controls."

## Undo

- Undo a transfer = reverse transfer, mirrored in the ledger.
- Undo a cancel = recreate the bill and remove the merchant block.
- Undo a rule = delete the rule.

## API routes

GET /summary, GET /forecast, GET /alerts, POST /approve, POST /undo, POST /ask, GET /ask/stream, POST /voice, GET /leaks, POST /leaks/cancel, GET /budget, POST /budget/build, POST /upload, POST /purchase-check, POST /simulate-week, POST /what-if, GET /trace/{id}, POST /reset

## Screens (max 4, bottom tab bar on mobile, sidebar on desktop)

0. Onboarding: 3 swipe cards, then "Show me my money". No forms.
1. Home: "Safe until" hero, health rings, forecast chart, money-saved counter, top alert, mic button
2. Alerts: proactive cards, fix options with what-if preview, Approve, trace drawer
3. Plan: budget with pace bars, leaks list (Keep / Cancel / Remind me), debt plan
4. Ask: big mic button + chat + photo upload, example questions, answers with small inline charts

## Product approach (Apple-style)

- Design the experience first, then the tech. The demo moment decides what gets built.
- Fewer features, all perfect. Cut half-working features before the demo.
- For each main screen, generate 3 versions, pick 1, polish it.
- Clarity: every screen answers one question. Hierarchy: biggest element = most important. Consistency: same cards, buttons, colors, motion everywhere.
- Content first, UI quiet. No decoration, no heavy borders.
- Smart defaults: no setup, works the moment it opens.
- Design loading, empty, and error states for every screen.
- Privacy line visible: "Nothing moves without your OK."
- Feels like ONE product. Never show tool/vendor names in main UI, only in the trace drawer.
- One owner (DRI) per area: backend, agent + voice, frontend, pitch.

## Simple for anyone (first-time users)

- 5-second test: Home must answer "Am I okay?" instantly.
- Plain words only on main screens. Jargon only inside "Why?" details. Use: "safety cushion" (emergency fund), "how full your card is" (utilization), "pay going to debt" (DTI), "going below $0" (overdraft), "paid every month" (recurring), "your money's next 60 days" (forecast), "yearly interest cost" (APR).
- One clear next step per screen.
- Progressive disclosure: details behind "Why?" / "See more".
- Every number has a "?" with a one-sentence explanation.
- Onboarding cards:
  1. "Ahead watches all your money in one place."
  2. "It warns you before money gets tight."
  3. "It suggests fixes. Nothing happens without your OK."
- Empty states guide: "No alerts. You're all clear until Dec 3."
- Example questions under the mic and chat: "Can I afford a $300 concert?", "Why is my score low?", "What if I lose my job?", "Move $200 to savings".
- Undo after every action.
- Green = good, orange = watch, red = act now. Never color alone, always add text.
- Before the demo, test with one person outside the team and fix where they get stuck.

## Design: Apple-inspired (do not copy Apple screens, logo, or product names)

Feel: calm, premium, lots of white space, one idea per card, no clutter.

- Font: -apple-system, BlinkMacSystemFont, "Inter", sans-serif. Hero numbers 56 to 72px semibold, tight tracking. Labels 13 to 15px grey.
- Light: bg #F5F5F7, card #FFFFFF, text #1D1D1F, secondary #86868B, accent #0071E3
- Dark: bg #000000, card #1C1C1E, text #F5F5F7
- Status: green #34C759, orange #FF9F0A, red #FF3B30. Color only for meaning.
- Cards: rounded-3xl, soft shadow (0 4px 24px rgba(0,0,0,0.06)), 24 to 32px padding
- Alerts: notification-style cards, frosted glass (backdrop-blur, white/70)
- Buttons: pill shape, one primary blue button per card, secondary text buttons
- Health score: 4 concentric activity-style rings, total in the center
- Charts: thin smooth line, soft gradient fill, no grid lines, minimal axes, dashed line for what-if, light band for uncertainty, dots for bills
- Mic: round button; listening = soft pulsing blue circle + large live transcript; speaking = gentle waveform + captions
- Icons: Lucide only, 1.5 stroke
- Layout: max width 1100px desktop, mobile first, 8pt spacing grid
- Support dark mode, prefers-reduced-motion, keyboard navigation, 4.5:1 text contrast

## Motion (framer-motion)

- Cards fade + slide up 8px, 250ms, ease-out, stagger 50ms
- On Approve: rings fill, score counts up (58 -> 71), safe date flips, forecast line morphs to new path
- What-if hover: new line draws in 400ms
- Agent thinking: subtle shimmer with live step names ("Checking bills", "Running forecast", "Verifying")
- No bouncy or flashy effects

## UX writing

- Short, calm, human. No jargon, no shame.
- Good: "Rent on the 1st may take you below $0 by $212. Here are 3 easy fixes."
- Bad: "Warning! You overspent again."
- Every number shows a one-line "why" on tap.
- Spoken answers max 2 sentences.
- Names: "Ahead", "Safe until", "Money leaks", "Autopilot", "Should I buy this?"
- Footer: "For education only. Not financial advice."

## Demo flow (must always work, keynote style)

1. Problem: "Only 63% of Americans can handle a $400 surprise."
2. Meet Maya: Home score 58, safe-until date close.
3. "Simulate next week" -> watcher creates alert -> open trace -> 3 fixes with what-if lines
4. Approve -> real Nessie transfer -> rings fill, score 71, safe date moves later
5. "Find money leaks" -> cancel 2 subs -> money-saved counter jumps
6. (If built) Upload BNPL screenshot -> forecast updates
7. "One more thing": Maya holds mic: "Can I afford a trip in March?" -> trace runs live -> two lines on chart -> app says "Yes, if you save $120 a week. Want me to set that up?" -> "Yes" -> autopilot rule created

Closing line: "Ahead keeps you one step ahead of your money."

## Build order

1. seed + sync + reset
2. tools + tests
3. agent (planner, critic, guard, watcher) + SSE stream
4. API routes
5. Home + Alerts screens
6. Plan screen (leaks, then budget)
7. Ask screen + onboarding
8. Voice (Nemotron ASR + TTS)
9. Gemini upload
10. Extras in listed order
11. Polish, outside-user test, deploy (Vercel + Render), backup demo video, pitch practice x5

## Ops

- CORS for the frontend URL. NEXT_PUBLIC_API_URL in env.
- Demo runs locally. Deployed version is the backup (free hosting may sleep).
- Public GitHub repo "ahead" with README: problem, demo GIF, architecture, how to run, tracks.
- Record a backup demo video before judging.

## Rules for Claude Code

- Read this file first every session.
- Build the core demo flow end to end before any extra.
- Use plan mode for each step, then build.
- After each step: run it, fix errors, then commit with a short message.
- Write small tests for every tool.
- Keep tool outputs short JSON so tool calling stays reliable.
- Timeouts, 3 retries with backoff, and fallbacks for every external API (Nessie, Nemotron, Nemotron Speech, Gemini). Cache identical requests.
- If the planner fails, use a rule-based fallback answer so the demo never breaks.
- Never let the LLM invent numbers. All numbers come from tools.
- If stuck twice on the same error, explain the cause before fixing.
