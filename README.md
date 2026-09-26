# BTO Money Timeline Simulator

A client-side web app that plays out, month by month, a couple's or a single's **cash** and **CPF Ordinary Account (OA)** from today until 12 months after key collection for a new HDB flat (BTO, Sale of Balance Flats or Open Booking) — and flags any month where a payment can't be covered by the right pot.

> **Estimates only.** Not financial advice. Always verify with HDB (your HFE letter and payment notices), CPF Board, IRAS and your bank.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (Vitest)
npm run build      # production build in dist/ (static files; host anywhere)
npm run lint
```

Everything runs in the browser. The layout works from 320px phones to desktop. It can be installed with **Add to Home Screen** (`public/manifest.webmanifest`) and works offline after one visit: `public/sw.js` loads pages from the network first and falls back to the cache, and serves the hashed build files from the cache. It's only registered in production builds. The build (`swAssets` in `vite.config.ts`) writes the list of build files and a per-build cache name into `dist/sw.js`, so every deploy gets a fresh cache and the old one is deleted.

Charts load as a separate file (`ui/lazyCharts.tsx`): the charting library is about half the code, so the page shows first and the charts follow.

Shared links show a preview card (title, description and `public/og.png`) from the `og:` tags in `index.html`. Those URLs are absolute (`https://bto-chi.vercel.app/…`), so update them if the domain changes. The icons and preview image are rendered from SVG with `rsvg-convert`. On phones, the payment and comparison tables switch to card lists. Scenarios are saved in `localStorage`. To share with your partner:

- **⋯ → Share link** (`state/share.ts`) puts the scenario in the link itself, deflated with the browser's `CompressionStream` and base64url-encoded after `#s=`. The part after `#` is never sent to the server. Opening the link adds the plan, or switches to it if the same plan is already there.
- **⋯ → Export** (a `.json` file) and **⋯ → Import** on the other phone.

**⋯ → Print summary** prints one page for an HDB or bank appointment (`ui/PrintSummary.tsx`): key dates, the loan, each payment with its cash/CPF split, and the problems to check. Choose "Save as PDF" in the print dialog to get a PDF.

## Project layout

```
src/
  config/policy.ts      ALL policy figures, each with source + last-verified date
  engine/               Pure TypeScript — no React. Unit-tested.
    types.ts            Data model (Scenario, SimResult, …)
    dates.ts            "YYYY-MM" month maths
    cpf.ts              Contributions, OA allocation by age, salary ceilings, bonuses
    stampDuty.ts        Buyer's Stamp Duty, conveyancing fees
    loan.ts             Instalments, loan-from-instalment
    payments.ts         Builds the dated payment schedule (downpayment tranches, grants, fees, costs, rent)
    simulate.ts         The month-by-month simulation of both pots for both partners
    warnings.ts         Shortfall / MSR / TDSR warnings + a solver that re-runs the
                        simulation to suggest fixes ("use $X more CPF", "delay renovation N months")
    whatIf.ts           "What if one of you loses your job?" stress test
    afford.ts           "How much can we afford?": highest price with no cash shortfall and MSR/TDSR within limits
    saleType.ts         BTO / SBF / open booking dates, completed flats, age-95 lease rule
    eligibility.ts      Household income, income ceiling, EHG / Step-Up grant amounts, citizen/PR rules
    accruedInterest.ts  CPF accrued interest at 5/10/15 years after keys
    compare.ts          Key-number rows for scenario comparison
    policyOverrides.ts  Applies per-scenario "Advanced settings" overrides to the policy
    __tests__/          Vitest tests
  state/                Seed scenarios, localStorage, JSON export/import
  ui/                   React components (wizard, editors, charts, tables, glossary tooltips)
```

## How the simulation works

- **Monthly steps.** Month-level dates only (`YYYY-MM`).
- **Income arrives the month after it's earned.**
  - Each month's CPF contributions and cash savings become available in the following month. Bonuses work the same way.
  - Payments due in a month are made before that month's income arrives. This is deliberately conservative.
- **CPF.**
  - Contributions use the rate and OA ratio for each person's age band.
  - Salary is capped at the monthly ceiling, and bonuses are capped by the annual ceiling.
  - Wages of $750 or less follow CPF's low-wage rules.
  - PRs pay the graduated rates in their first two years (from "PR since"), then full rates.
  - Self-employed partners get no employer CPF.
  - **Bonuses** can be months of salary or a fixed dollar amount, paid every year or in one year only. Employees pay CPF on them, capped by the annual salary ceiling.
  - **Voluntary CPF top-ups** can be monthly, yearly or once, per partner. They're paid from that partner's cash and split across OA, SA and MA using the normal allocation ratios. They're capped by the CPF Annual Limit ($37,740 a year, normal + voluntary), and never exceed the cash that partner has. Any cut is noted, and "pause top-ups" is offered as a fix when cash runs short.
  - OA interest accrues monthly and is credited in December.
  - **Turning 55 isn't simulated.** At 55, CPF moves SA then OA savings into a new Retirement Account up to the Full Retirement Sum ($220,400); OA contributions after 55 can still pay the loan. The app doesn't track SA, so it warns instead: a warning if someone turns 55 within the plan while CPF pays the mortgage (OA shown after that may be too high), a note if it happens later but before the loan ends.
- **Pay that isn't steady** (Us → Job & pay changes, per partner).
  - **New job / new pay** from a month: a new gross salary, optionally with new monthly savings. Raises continue from there.
  - **Time without income**, from a month with an optional end. No salary, CPF or bonus, and living costs come out of savings each month (defaults to take-home pay minus savings).
  - **Different raise for a year**: overrides the usual raise that January (e.g. 0% one year, 10% the next).
  - A gap in the 12 months before the income assessment breaks the grant's continuous-work rule, and lowers the income used for the grant and loan checks.
- **What if one of you loses your job?** (Overview, `whatIf.ts`) Re-runs the plan with each partner out of work for 3–12 months, starting now, at AFL or at keys. It shows the lowest cash afterwards and whether cash runs out, and can add the result as a scenario to compare. When the job loss overlaps the mortgage, it points to HDB's Financial Assistance Measures (reduce or defer instalments for 6 months; 12 months with interest suspended under the Homeowner Job Support pilot; a longer loan), or for bank loans, talking to the bank early. Deferrals aren't simulated.
- **How much can we afford?** (Overview, `afford.ts`) Binary-searches the flat price, to the nearest $1,000, for the highest price with no month short of cash and MSR (plus TDSR for bank loans) within limits. Everything else stays the same: loan type and LTV, CPF slider, costs, grants and dates. It says which limit stops you. If the plan runs short even at $50,000, the shortfall isn't about the price, and it says so.
- **Who's buying** (Us section).
  - **Couple**, **Single**, or **Two singles** under the Joint Singles Scheme. The scheme allows up to 4 people; the app models 2.
  - **Singles:**
    - Must be Singapore Citizens aged 35+ and first-timers, and can buy only a 2-room Flexi when buying new (any location); breaches are flagged.
    - Income ceiling $8,000 (from 24 Aug 2026). The grant uses the singles table on your income, up to $60,000.
    - No staggered downpayment or Deferred Income Assessment.
    - The engine models you with an empty second person (no income, savings or CPF) who pays nothing, and couple-only controls are hidden.
  - **Joint Singles:** both incomes count, the families grant table applies (up to $120,000), and the ceiling is assumed to be $16,000.
- **How you're buying** (Flat section, `saleType.ts`).
  - **BTO:** application → booking → AFL → keys.
  - **SBF (Sale of Balance Flats):** the same, usually with a shorter wait. It can be **completed**.
  - **Open booking:** no ballot, so application = booking month.
  - **Completed flat (SBF / open booking):**
    - AFL and key collection happen together, within 9 months of booking (warned if later).
    - The full downpayment, stamp duty and fees are paid then; the staggered scheme doesn't apply.
    - Under DIA, income is assessed at booking.
  - **Remaining lease (age-95 rule):**
    - If the lease won't last the youngest of you to 95, CPF use and the HDB loan limit are pro-rated (lease ÷ years to 95).
    - 20 years or less: no CPF and no HDB loan.
- **Eligibility and grants** (`eligibility.ts`).
  - Household income uses the 12 months ending 2 months before you apply for the HFE letter. Like HDB, each person's gross pay (no bonuses or employer CPF) is averaged over the months they actually worked in that window (no-pay months don't count), then the averages are added. HFE month: set under Key dates (default a month before the flat application, since you need a valid letter to apply and it takes up to a month; valid 9 months, with a warning if it would expire or comes after the application). Under DIA, the assessment month.
  - That income is checked against the ceiling for the flat type.
  - The **Enhanced CPF Housing Grant** can be auto-calculated:
    - Both first-timers: families table.
    - One first-timer, one second-timer: singles table on half the income, all paid to the first-timer (pick who's the second-timer in the Flat section).
    - Both second-timers: none.
    - At least one of you must have worked 12 months straight.
  - The **Step-Up grant** ($15,000, income up to $8,000) can be auto-calculated for second-timers in public rental or owning a 2- or 3-room flat, buying a 2-room Flexi or 3-room Standard flat.
  - Citizen + PR couples: the $10,000 premium is added to the price. Two PRs are flagged as not eligible for a BTO.
- **Loan limits.**
  - A bank loan's LTV drops to 55% (with 10% cash) if the tenure is over 25 years, or the loan runs past the borrowers' income-weighted average age of 65.
  - An HDB loan runs for the shortest of 25 years, 65 minus the applicants' average age (whole years, at application), and the remaining lease minus 20 years. A longer tenure is capped automatically, like the LTV, with a warning showing the instalment it gives.
- **Loan changes after key collection** (Loan section).
  - **Rate changes:** add as many as you like, to model a floating rate (e.g. fixed 2.2% for 3 years, then 3.0%, then 2.8%). Works for HDB and bank loans.
  - **Refinance / switch HDB → bank:** a new rate, an optional new remaining tenure, cash costs, and a lock-in penalty as % of the balance. From an HDB loan it's one-way, and the bank-loan CPF limit applies from then (CPF already used counts).
  - **Tenure changes:** a new remaining tenure from a month.
  - **Partial prepayments:** a lump sum from cash or CPF OA, once or every year (optional end month).
    - Then either a lower instalment (same end date) or finishing sooner (same instalment).
    - CPF used counts towards your CPF refund on sale and the bank-loan CPF limit.
    - A bank-loan prepayment penalty (% of the amount) can be set; HDB loans have none.
    - A prepayment can pay the loan off entirely.
  - Each change re-works the instalment on the outstanding balance. The loan panel lists the path. Warnings flag terms past the usual tenure or age limits.
  - **Timing of an HDB → bank switch:**
    - **Before keys:** the bank loan starts at key collection, and the bank's cash rule applies then. At least 5% of the price must be paid in cash across the downpayment (option fee + AFL + keys), so any AFL portion paid with CPF is made up in cash at keys. The bank's MSR/TDSR at its 4% stress rate is checked against income at keys.
    - **Before AFL:** you're told to just pick "Bank loan".
    - **After keys:** no HDB penalty and no cash rule.
  - A bank loan can never go back to an HDB loan. Refinancing from HDB takes about 6–8 weeks from applying with the bank's Letter of Offer (shown as a tip).
  - A bank loan needs the bank's Letter of Offer before AFL (shown under Loan type).
- **CPF limit for the flat.** With a bank loan, CPF used for the flat is capped at the price. It goes up to 120% if you tick that you've set aside the Basic Retirement Sum. After that, the mortgage is paid in cash. HDB loans have no cap.
- **Stamp duty with a bank loan.** It's paid in cash at AFL and reimbursed from CPF 2 months later (the CPF share follows the slider).
- **Resale levy** (Flat section, second-timers): pick your first subsidised flat and the levy is added at key collection, in cash (it can't be paid with CPF or a loan). $15,000 (2-room) to $55,000 (EC); a "half levy" toggle covers e.g. a divorced second-timer buying with a first-timer. If you'll sell your current flat after keys, it comes out of the sale proceeds instead: edit or remove the item. Second-timers who haven't picked are warned.
- **Running costs after keys** (Costs section): service & conservancy charges every month (one town council's Singapore Citizen owner-occupier rate by flat type; rebates not included) and property tax every year from 12 months after keys (owner-occupier bands on an estimated annual value, editable under Advanced settings; $0 for most flats). Both are cash. Plans saved before these items existed get them added once, on load or import (`upgradeCosts`).
- **Money coming in** (Costs section): gifts, hongbao, car sale and similar. Entered as positive amounts and added to the chosen partner's (or both partners') cash in that month. Not counted as payments.
- **Assumptions** (Costs section).
  - Interest on cash, compounded monthly.
  - Cost inflation, applied to your own costs and rent (not official fees).
- **Downpayment and loan.**
  - The downpayment is split into an AFL tranche and a key-collection tranche, following the policy table for your loan type and scheme (standard, staggered or DIA). Bank loans at 55% LTV use HDB's separate splits.
  - Staggered downpayment is flagged if you probably don't qualify: HFE letter after the younger applicant's 30th birthday, a flat bigger than 5-room, or second-timers not right-sizing to a 3-room or smaller.
  - The option fee counts towards the AFL tranche. Minimum cash rules for bank loans are enforced.
- **Grants.**
  - Grants are credited to OA on the chosen milestone and applied to the next tranche.
  - Any grant left over reduces the loan.
- **How each payment is funded.**
  - Cash-only items come from cash.
  - For CPF-allowed items, the **CPF slider** is the plan.
  - If OA is short, the rest falls back to cash; this is shown as a note.
  - If cash is short, cash goes negative and is flagged as an error.
- **Deferred Income Assessment (DIA)** (Loan section).
  - Uses the DIA downpayment table: 2.5% at AFL, the rest at key collection.
  - Assesses MSR/TDSR on income about 3 months before keys, instead of at AFL.
  - Checks the age rule (at least one of you ≤ 30 at application), shows an eligibility checklist, and warns if a grant is set to arrive before keys.
  - Pair it with **"Still studying / in NS"** under Us. Before the work-start month a partner has no salary, CPF or bonus, only the "saved per month until then" amount.
  - Without DIA, having no income at AFL is flagged, with a suggestion to turn DIA on.
  - **Income above the ceiling at the deferred check:**
    - Eligibility to buy is still judged on income when applying, so you keep the flat.
    - The grant is recalculated (none above $9,000).
    - If income is above the HDB loan ceiling ($16,000 families / $8,000 singles), it's flagged as "no HDB loan". The fix is a "Switch to bank loan" dated at keys, which shows the extra cash for the bank's 5% rule.
    - The Flat page shows both incomes.
- **HDB loan rule.** With an HDB loan, OA above the retention limit ($20k each) is used for the downpayment, even if the slider is set lower.
- **Mortgage.** An HDB loan's first instalment is on the 1st of the 2nd month after keys (keys in March → 1 May); a bank loan's the month after keys. It is paid from OA first, then cash (you can change this). HDB partial repayments must be at least $5,000 in $1,000 steps (paying the loan off can be any amount); other amounts are flagged.
- **Joint payments** are split by the joint-split slider. With "Pool our cash" on, one partner's cash covers the other's shortfall.
- **HDB's check before keys.** For HDB loans on uncompleted flats (without DIA), HDB re-checks your finances nearer completion and may reduce the loan. The app checks the instalment at HDB's 3% floor against income about 3 months before keys and warns if it's over 30% (e.g. after a job loss or study).
- **MSR/TDSR.**
  - These are tested at the higher of your loan rate and the stress-test rate (3% for HDB loans, 4% for bank loans).
  - Income is taken at AFL (or about 3 months before keys with DIA). TDSR is only checked for bank loans.
- **Accrued interest.**
  - Covers the CPF used for housing, including grants, the downpayment, BSD, legal fees and mortgage.
  - Interest accrues monthly and compounds yearly.
  - The projection comes from running the full simulation 15 years past keys (salary raises, CPF, mortgage, rate changes, CPF limit).

## Updating policy figures

All figures live in **`src/config/policy.ts`**.

1. Check the official page (hdb.gov.sg, cpf.gov.sg, iras.gov.sg).
2. Edit the number in `DEFAULT_POLICY`. Update the comment above it with the source and new date. Use **VERIFIED** / **SECONDARY** / **UNVERIFIED** for its status.
3. Update the entry in `POLICY_META` (its `status` and `source` are shown in Advanced settings). Bump `POLICY_VERSION_DATE`.
4. Run `npm test`. Some tests pin known official examples, like the IRAS BSD worked example. If a rule itself changed, update those tests too.

Users can override any figure for a single scenario under **Advanced settings**. Overrides are stored as `path → value` (for example `"hdbLoan.interestRate": 0.027`). Paths that no longer exist are ignored, so changing the policy structure won't break saved scenarios.

### Verification status (checked 2026-09-23)

| Figure | Status |
|---|---|
| CPF contribution rates & OA allocation by age (from 1 Jan 2026) | Verified (cpf.gov.sg) |
| OW ceiling $8,000 / annual ceiling $102,000 | Verified (cpf.gov.sg) |
| BSD tiers (1/2/3/4/5/6%) | Verified (iras.gov.sg) |
| Option fees ($500 / $1,000 / $2,000) | Verified (HDB BTO Annex C) |
| HDB loan LTV 75%; downpayment 10% (HDB) / 20% (bank) at AFL | Verified (HDB BTO Annex C) |
| Deferred Income Assessment: eligibility, 2.5% at AFL, income assessed ~3 months before completion, grant paid at keys | Verified (HDB "Annex A: Details on Deferred Income Assessment", 2024) |
| DIA with a bank loan: 2.5% cash at AFL; keys 22.5% (≥ 2.5% cash), or 42.5% (≥ 7.5% cash) at 55% LTV | Verified (hdb.gov.sg Staggered Downpayment Scheme page, checked 2026-09-26) |
| Caveat fee $64.45; first conveyancing tier $0.90 per $1,000 | Verified (cpf.gov.sg) |
| HDB loan rate = CPF OA rate + 0.1% (2.5% + 0.1% = 2.6%) | Verified peg (hdb.gov.sg, checked 2026-09-26); OA rate 2.5% secondary |
| Accrued interest = OA rate, monthly/compounded yearly | Secondary (CPF page for the method returned 404) |
| Staggered downpayment: HDB loan 5% at AFL / 20% at keys; bank loan 10% at AFL (≥ 5% cash) / 15%, or 10% cash / 35% at 55% LTV; eligibility (HFE by younger's 30th birthday, ≤ 5-room, right-sizers ≤ 3-room) | Verified (hdb.gov.sg Staggered Downpayment Scheme page, checked 2026-09-26) |
| MSR 30% and 3% floor for HDB loans | Verified (hdb.gov.sg HDB housing loan page, checked 2026-09-26) |
| TDSR 55%, 4% stress rate for bank loans | Secondary (MAS site was down) |
| Fire insurance premiums | Secondary |
| HDB loan tenure: shortest of 25 yrs, 65 − average age, lease − 20 | Verified (hdb.gov.sg HDB housing loan page, checked 2026-09-26) |
| Bank loan: up to 30 years; 75% LTV; at least 5% cash; Letter of Offer before AFL; private lawyer; no refinancing to HDB | Verified (hdb.gov.sg Housing loan from FIs, checked 2026-09-26) |
| Bank loan 55% LTV / 10% cash when tenure > 25 yrs or past age 65 | Secondary (MAS; HDB only says banks may restrict) |
| HPS compulsory only when CPF pays the instalments | Verified (hdb.gov.sg, checked 2026-09-26) |
| Seniors (SC 55+): short-lease 2-room Flexi / Community Care Apartments, lease 15–45 yrs to cover all to 95, no housing loan — not modelled; a note points to them when every buyer is 55+ | Verified (hdb.gov.sg seniors page, checked 2026-09-26) |
| HDB loan: first instalment on the 1st of the 2nd month after disbursement (keys); partial repayments ≥ $5,000 in $1,000 steps, no fee | Verified (hdb.gov.sg Payments for HDB housing loan, checked 2026-09-26) |
| Bank loan: first instalment the month after keys | **Not verified** (varies by bank) |
| HDB → bank refinancing is one-way; takes ~6–8 weeks; a bank loan can't be refinanced to HDB | Verified (hdb.gov.sg Refinancing HDB housing loan, checked 2026-09-26) |
| HDB loan repayment period can be changed later (branch appointment; new CPF form; HPS extended) | Verified (hdb.gov.sg, checked 2026-09-26); limits for extensions not stated, so the purchase-time limits are used for the warning |
| HFE letter: valid 9 months; needed when you apply; up to a month to process; HDB re-checks finances before keys (HDB loans) | Verified (hdb.gov.sg HFE letter pages, checked 2026-09-26) |
| HFE income: 12 months to 2 months before the HFE month; each person's total ÷ months worked; bonuses and employer CPF excluded | Verified (hdb.gov.sg Income guidelines, checked 2026-09-26) |
| HDB loan: each applicant may keep up to $20k OA | Verified (hdb.gov.sg Use of CPF savings, checked 2026-09-26) |
| Conveyancing tiers after the first; GST 9% | **Not verified** (HDB page blocked automated access) |
| Survey fee per flat type (only the $163.50–$408.75 range verified) | **Not verified** |
| CPF rates for PRs in years 1–2; low-wage (≤ $750) formulas | Verified (cpf.gov.sg 2026 rate tables) |
| OA share for PR graduated rates (assumed = citizen ratios) | **Not verified** |
| 2-room Flexi ceiling $7,000 (Feb 2026; may have risen in Aug 2026) | Verified for Feb 2026 (HDB Annex B) |
| Income ceilings $16,000 families / $24,000 extended families / $8,000 singles | Verified (hdb.gov.sg HDB housing loan eligibility, checked 2026-09-26) |
| CPF Annual Limit $37,740; voluntary top-ups allocated like normal contributions | Secondary (cpf.gov.sg search snippet) |
| EHG: families up to $120k (ceiling $9,000); FT+ST couples get EHG (Singles) up to $60k on half the income (ceiling $4,500), paid to the first-timer; pro-rated if the lease doesn't cover the youngest to 95 | Verified (hdb.gov.sg EHG page; the app's tables reproduce HDB's 5 worked examples, checked 2026-09-26). Band values between the examples are secondary |
| Top-Up Grant: singles who bought a 2-room Flexi and later marry: up to $15,000 (income ≤ $8,000; apply within 6 months) — shown as a note, not added. Resale-only grants (Family Grant, Proximity) are flagged on new flats | Verified (hdb.gov.sg CPF Housing Grant for resale flats page, checked 2026-09-26) |
| EHG 12-month work rule and income window | Verified (mynicehome.gov.sg) |
| Step-Up grant $15,000: second-timers in public rental or owning a 2-/3-room flat (Standard, or non-mature estate), buying a 2-room Flexi or 3-room Standard flat; income ≤ $8,000 | Verified (hdb.gov.sg Step-Up CPF Housing Grant, checked 2026-09-26) |
| SC/SPR $10,000 premium | Secondary |
| CPF Valuation Limit / 120% Withdrawal Limit with BRS (bank loans) | Verified (cpf.gov.sg) |
| BRS $110,200 (2026) | Secondary |
| Bank loan LTV 55% if tenure > 25 yrs or past age 65; 10% cash | Secondary (MAS explainer snippet) |
| Bank loan: BSD reimbursed from CPF after 2 months | **Not verified** (estimate) |
| Resale levy $15k / $30k / $40k / $45k / $50k / $55k (2-room … EC); cash only; half in some cases | Secondary (2026 guides agree; hdb.gov.sg not read). 3Gen assumed = 5-room: **not verified** |
| S&CC per month (Singapore Citizen owner-occupier) | Verified for one town council (Bishan-Toa Payoh, 1 Jul 2024); varies by town |
| Owner-occupier property tax bands (0% to $12k AV, then 4%…) | Secondary (IRAS page needs JavaScript; rates from guides) |
| Annual values of HDB flats by type | **Not verified** (guides disagree; may be low for 2026) |
| Completed SBF / open-booking flats: AFL + keys within 9 months of booking | Secondary (hdb.gov.sg key collection page, snippet) |
| Open booking: first-come-first-served, book from next working day | Secondary (hdb.gov.sg snippet) |
| Age-95 lease rule: pro-rated CPF use / HDB LTV; no CPF ≤ 20 yrs; HDB tenure ≤ lease − 20 | Secondary (MND 2019 rules, snippets) |
| Typical dates for SBF / open booking (booking +3 months to keys for completed flats) | **Not verified** (defaults to adjust) |
| Singles: SC, 35+, 2-room Flexi only for new flats (any location); grant up to $60k | Secondary (HDB via guides, snippets) |
| Singles income ceiling $8,000 from 24 Aug 2026 (was $7,000) | Secondary (NDR 2026 news) |
| Joint Singles Scheme ceiling (assumed $16,000) and families grant table | **Not verified** |
| Single second-timers can't buy a new flat | **Not verified** |
| DIA: buying eligibility judged at application; HDB loan not available if deferred income > HDB loan ceiling | Secondary (guides) / **not read on hdb.gov.sg** |
| Letter of Offer needed before AFL for bank loans | Verified (HDB BTO Annex, Oct 2024 / Feb 2026) |
| HDB → bank before keys: 5% cash made up at keys; no HDB penalty after keys; no bank → HDB | From you / general guidance; **not read on hdb.gov.sg** |
| When EHG is credited for a BTO (default: key collection) | Verified for DIA buyers (paid at key collection); otherwise **not verified**, editable per grant |

## Known simplifications

- Month granularity, no daily timing. Cash interest and inflation are single flat rates you set.
- Income before today is assumed to equal today's salary (for the 12-month grant window).
- Resale levy for second-timers isn't included (a note reminds you).
- HDB and bank loan amounts aren't capped by HDB's or the bank's own loan-eligibility calculation, only flagged via MSR/TDSR.
- The extra 1% CPF interest isn't modelled. It goes to the Special/Retirement Account, not the OA.
- Plus/Prime flats only get an informational note. Their conditions affect resale, not the payments shown here.
- The Proximity Housing Grant and CPF Housing (Family) Grant are resale-only. The app warns if you add them to a BTO.
