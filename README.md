# BTO Money Timeline Simulator

A client-side web app that plays out, month by month, a couple's **cash** and **CPF Ordinary Account (OA)** from today until 12 months after BTO key collection — and flags any month where a payment can't be covered by the right pot.

> **Estimates only.** Not financial advice. Always verify with HDB (your HFE letter and payment notices), CPF Board, IRAS and your bank.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (Vitest)
npm run build      # production build in dist/ (static files; host anywhere)
npm run lint
```

Everything runs in the browser. The layout works from 320px phones to desktop. On phones, the payment and comparison tables switch to card lists. Scenarios are saved in `localStorage`. To share with your partner, use **⋯ → Export** (a `.json` file) and **⋯ → Import** on the other phone.

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
- **Pay that isn't steady** (Us → Job & pay changes, per partner).
  - **New job / new pay** from a month: a new gross salary, optionally with new monthly savings. Raises continue from there.
  - **Time without income**, from a month with an optional end. No salary, CPF or bonus, and living costs come out of savings each month (defaults to take-home pay minus savings).
  - **Different raise for a year**: overrides the usual raise that January (e.g. 0% one year, 10% the next).
  - A gap in the 12 months before the income assessment breaks the grant's continuous-work rule, and lowers the income used for the grant and loan checks.
- **What if one of you loses your job?** (Overview, `whatIf.ts`) Re-runs the plan with each partner out of work for 3–12 months, starting now, at AFL or at keys. It shows the lowest cash afterwards and whether cash runs out, and can add the result as a scenario to compare.
- **Eligibility and grants** (`eligibility.ts`).
  - Household income is averaged over 12 months, ending 2 months before the HFE application (assumed to be the application month; under DIA, the assessment month).
  - That income is checked against the ceiling for the flat type.
  - The **Enhanced CPF Housing Grant** can be auto-calculated:
    - Both first-timers: families table.
    - One first-timer, one second-timer: singles table on half the income.
    - Both second-timers: none.
    - At least one of you must have worked 12 months straight.
  - The **Step-Up grant** can be auto-calculated for second-timers moving from public rental or a 2-room flat.
  - Citizen + PR couples: the $10,000 premium is added to the price. Two PRs are flagged as not eligible for a BTO.
- **Loan limits.**
  - A bank loan's LTV drops to 55% (with 10% cash) if the tenure is over 25 years, or the loan runs past the borrowers' income-weighted average age of 65.
  - An HDB loan that runs past 65 gets a warning.
  - Bank loans can have a different rate after the lock-in; the instalment is recalculated from that month.
- **CPF limit for the flat.** With a bank loan, CPF used for the flat is capped at the price. It goes up to 120% if you tick that you've set aside the Basic Retirement Sum. After that, the mortgage is paid in cash. HDB loans have no cap.
- **Stamp duty with a bank loan.** It's paid in cash at AFL and reimbursed from CPF 2 months later (the CPF share follows the slider).
- **Money coming in** (Costs section): gifts, hongbao, car sale and similar. Entered as positive amounts and added to the chosen partner's (or both partners') cash in that month. Not counted as payments.
- **Assumptions** (Costs section).
  - Interest on cash, compounded monthly.
  - Cost inflation, applied to your own costs and rent (not official fees).
- **Downpayment and loan.**
  - The downpayment is split into an AFL tranche and a key-collection tranche, following the policy table for your loan type (standard or staggered).
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
- **HDB loan rule.** With an HDB loan, OA above the retention limit ($20k each) is used for the downpayment, even if the slider is set lower.
- **Mortgage.** The mortgage starts the month after keys. It is paid from OA first, then cash (you can change this).
- **Joint payments** are split by the joint-split slider. With "Pool our cash" on, one partner's cash covers the other's shortfall.
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
| DIA with a bank loan: 2.5% at AFL; cash split assumed same as bank staggered | Secondary |
| Caveat fee $64.45; first conveyancing tier $0.90 per $1,000 | Verified (cpf.gov.sg) |
| OA interest 2.5%, HDB loan rate 2.6% | Secondary (CPF releases seen in search; page not read) |
| Accrued interest = OA rate, monthly/compounded yearly | Secondary (CPF page for the method returned 404) |
| Staggered downpayment 2.5% at AFL (both loan types) and bank-loan cash splits | Secondary (HDB footnote + guides) |
| Bank loan min 5% cash | Secondary |
| MSR 30%, TDSR 55%, stress rates 3% HDB / 4% bank | Secondary (MAS site was down) |
| Fire insurance premiums | Secondary |
| HDB loan max tenure 25 yrs; bank 30 yrs | **Not verified** |
| HDB loan: may keep up to $20k OA (per person here) | **Not verified** |
| Conveyancing tiers after the first; GST 9% | **Not verified** (HDB page blocked automated access) |
| Survey fee per flat type (only the $163.50–$408.75 range verified) | **Not verified** |
| CPF rates for PRs in years 1–2; low-wage (≤ $750) formulas | Verified (cpf.gov.sg 2026 rate tables) |
| OA share for PR graduated rates (assumed = citizen ratios) | **Not verified** |
| Income ceilings $14k / $7k (2-room Flexi) / $21k (extended), Feb 2026 | Verified (HDB Feb 2026 Annex B) |
| Families' ceiling raised to $16,000 from 24 Aug 2026 | News + confirmed by you; not yet read on hdb.gov.sg (2-room Flexi ceiling may also have changed) |
| CPF Annual Limit $37,740; voluntary top-ups allocated like normal contributions | Secondary (cpf.gov.sg search snippet) |
| EHG table bands (max $120k, ceiling $9k verified); singles table for FT+ST couples | Secondary for the bands |
| EHG 12-month work rule and income window | Verified (mynicehome.gov.sg) |
| Step-Up grant $15,000, income ≤ $7,000 | Secondary |
| SC/SPR $10,000 premium | Secondary |
| CPF Valuation Limit / 120% Withdrawal Limit with BRS (bank loans) | Verified (cpf.gov.sg) |
| BRS $110,200 (2026) | Secondary |
| Bank loan LTV 55% if tenure > 25 yrs or past age 65; 10% cash | Secondary (MAS explainer snippet) |
| HDB loan must end by age 65 | **Not verified** |
| Bank loan: BSD reimbursed from CPF after 2 months | **Not verified** (estimate) |
| When EHG is credited for a BTO (default: key collection) | Verified for DIA buyers (paid at key collection); otherwise **not verified**, editable per grant |

## Known simplifications

- Month granularity, no daily timing. Cash interest and inflation are single flat rates you set.
- Income before today is assumed to equal today's salary (for the 12-month grant window).
- Resale levy for second-timers isn't included (a note reminds you).
- HDB and bank loan amounts aren't capped by HDB's or the bank's own loan-eligibility calculation, only flagged via MSR/TDSR.
- The extra 1% CPF interest isn't modelled. It goes to the Special/Retirement Account, not the OA.
- Plus/Prime flats only get an informational note. Their conditions affect resale, not the payments shown here.
- The Proximity Housing Grant and CPF Housing (Family) Grant are resale-only. The app warns if you add them to a BTO.
