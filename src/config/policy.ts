/**
 * ALL policy figures used by the simulator live in this file.
 *
 * Every figure has a comment giving its source and the date it was last
 * verified. "VERIFIED" means the figure was read directly on an official
 * page (hdb.gov.sg / cpf.gov.sg / iras.gov.sg). "SECONDARY" means it was
 * only confirmed via news/secondary sources. "UNVERIFIED" means it is from
 * general knowledge and could not be confirmed in the last check.
 *
 * Every numeric leaf here can be overridden per scenario in the UI under
 * "Advanced settings" (see engine/policyOverrides.ts). The labels shown in
 * the UI come from POLICY_META at the bottom of this file.
 *
 * To update: change the number, update the comment's source + date, and bump
 * POLICY_VERSION_DATE. Run `npm test` afterwards.
 */

export const POLICY_VERSION_DATE = '2026-09-26'

export type FlatType = '2R' | '3R' | '4R' | '5R' | '3Gen' | 'Exec'

export interface ContributionBand {
  /** Band applies while age (in months) is <= maxAgeYears * 12. */
  maxAgeYears: number
  employer: number
  employee: number
  /** Share of the total contribution that goes to the Ordinary Account. */
  oaRatio: number
}

export interface SprBand {
  maxAgeYears: number
  employer: number
  employee: number
}

export interface GrantTier {
  /** Average monthly income up to and including this amount gets `amount`. */
  upTo: number
  amount: number
}

export interface Tier {
  /** Width of this tier in dollars (Infinity for the last tier). */
  width: number
  rate: number
}

export interface Tranche {
  /** Portion of flat price payable at this milestone. */
  pct: number
  /** Portion of flat price at this milestone that must be paid in cash. */
  minCashPct: number
}

export interface DownpaymentSchedule {
  afl: Tranche
  /** Keys tranche absorbs any remaining downpayment: (1 - LTV) - afl.pct. */
  keys: Tranche
  /** Bank loans whose LTV drops to 55% (long tenure / past age 65): HDB gives separate splits. */
  reducedLtv?: { afl: Tranche; keys: Tranche }
}

export interface Policy {
  cpf: {
    bands: ContributionBand[]
    owCeilingMonthly: number
    annualSalaryCeiling: number
    oaInterestRate: number
    accruedInterestRate: number
    /** Graduated rates for Singapore PRs in their 1st and 2nd year (OA ratio as SC). */
    spr: { year1: SprBand[]; year2: SprBand[] }
    lowWage: { nilUpTo: number; employerOnlyUpTo: number; phaseInUpTo: number; employeeFactor: number }
    /** With a bank loan: CPF usable up to this multiple of the Valuation Limit if BRS set aside. */
    withdrawalLimitMultiple: number
    basicRetirementSum: number
    /** At 55, SA then OA savings move to a new Retirement Account up to this sum. */
    fullRetirementSum: number
    /** Max total CPF contributions (mandatory + voluntary) per person per calendar year. */
    annualLimit: number
  }
  hdbLoan: {
    interestRate: number
    maxLtv: number
    stressRate: number
    maxTenureYears: number
    oaRetainMax: number
    maxAgeAtEnd: number
    /** First instalment this many months after key collection (loan disbursement). */
    firstInstalmentMonths: number
    /** Partial repayments: at least this much, in multiples of prepayStep. */
    minPrepay: number
    prepayStep: number
  }
  bankLoan: {
    defaultInterestRate: number
    maxLtv: number
    minCashPct: number
    stressRate: number
    maxTenureYears: number
    /** First instalment this many months after key collection. */
    firstInstalmentMonths: number
    /** LTV drops to this if tenure > ltvTenureYears or the loan runs past ltvMaxAge. */
    reducedLtv: number
    reducedMinCashPct: number
    ltvTenureYears: number
    ltvMaxAge: number
    /** With a bank loan, BSD is paid in cash first and reimbursed from CPF this many months later. */
    bsdReimburseMonths: number
  }
  msr: number
  tdsr: number
  bsdTiers: Tier[]
  optionFee: Record<FlatType, number>
  downpayment: {
    hdb: { standard: DownpaymentSchedule; staggered: DownpaymentSchedule; dia: DownpaymentSchedule }
    bank: { standard: DownpaymentSchedule; staggered: DownpaymentSchedule; dia: DownpaymentSchedule }
  }
  lease: {
    /** CPF use / HDB LTV are full only if the lease lasts the youngest buyer to this age. */
    coverToAge: number
    /** No CPF use (or HDB loan) if the remaining lease is this many years or less. */
    minYearsForCpf: number
    /** Completed flats: AFL + key collection within this many months of booking. */
    completedKeysWithinMonths: number
  }
  staggered: {
    /** HFE letter applied for on or before the younger applicant's birthday at this age. */
    maxYoungerAgeYears: number
    /** Right-sizing flat owners: 3-room or smaller only. */
    rightSizerFlatTypes: FlatType[]
    /** Couples: 5-room or smaller. */
    flatTypes: FlatType[]
  }
  dia: {
    maxAgeYears: number
    assessmentMonthsBeforeKeys: number
    recentGradMonths: number
  }
  eligibility: {
    incomeCeilingFamilies: number
    incomeCeiling2RFlexi: number
    incomeCeilingExtended: number
    scSprPremium: number
    ehgFamilies: GrantTier[]
    ehgSingles: GrantTier[]
    ehgEmploymentMonths: number
    ehgIncomeLagMonths: number
    stepUpAmount: number
    stepUpIncomeCeiling: number
    incomeCeilingSingles: number
    incomeCeilingJointSingles: number
    singlesMinAge: number
  }
  /** Second-timers buying another subsidised flat: fixed levy by the type of their first subsidised flat. */
  resaleLevy: Record<FlatType | 'EC', number>
  /** Running costs after key collection. */
  runningCosts: {
    /** Monthly service & conservancy charges (Singapore Citizen owner-occupier rate). */
    sccMonthly: Record<FlatType, number>
    /** Owner-occupier property tax bands on the flat's annual value. */
    propertyTaxTiers: Tier[]
    /** Estimated annual value by flat type (IRAS sets the real one after completion). */
    annualValue: Record<FlatType, number>
  }
  fees: {
    conveyancingTiers: Tier[]
    conveyancingRoundTo: number
    conveyancingMin: number
    gst: number
    caveatFee: number
    surveyFee: Record<FlatType, number>
    bankLegalFee: number
    fireInsurance5yr: Record<FlatType, number>
  }
}

export const DEFAULT_POLICY: Policy = {
  cpf: {
    // CPF contribution rates (private sector, SC / 3rd-year SPR, wages > $750)
    // and OA allocation ratios, both effective 1 Jan 2026.
    // Source: cpf.gov.sg "How much CPF contributions to pay" +
    //   "CPF Allocation Rates from 1 January 2026" (PDF).
    // VERIFIED 2026-09-23.
    // Note: from 1 Jan 2027 rates for ages >55–65 rise (35.5% / 26%), but the
    // increase goes to the RA, not the OA, so OA inflows are unaffected.
    bands: [
      { maxAgeYears: 35, employer: 0.17, employee: 0.2, oaRatio: 0.6217 },
      { maxAgeYears: 45, employer: 0.17, employee: 0.2, oaRatio: 0.5677 },
      { maxAgeYears: 50, employer: 0.17, employee: 0.2, oaRatio: 0.5136 },
      { maxAgeYears: 55, employer: 0.17, employee: 0.2, oaRatio: 0.4055 },
      { maxAgeYears: 60, employer: 0.16, employee: 0.18, oaRatio: 0.353 },
      { maxAgeYears: 65, employer: 0.125, employee: 0.125, oaRatio: 0.14 },
      { maxAgeYears: 70, employer: 0.09, employee: 0.075, oaRatio: 0.0607 },
      { maxAgeYears: 200, employer: 0.075, employee: 0.05, oaRatio: 0.08 },
    ],
    // Ordinary Wage ceiling, $8,000/month from 1 Jan 2026.
    // Source: cpf.gov.sg "What is the Ordinary Wage (OW) ceiling?". VERIFIED 2026-09-23.
    owCeilingMonthly: 8000,
    // Annual salary ceiling (caps CPF on OW + bonuses). Same source. VERIFIED 2026-09-23.
    annualSalaryCeiling: 102000,
    // OA interest rate: floor of 2.5% p.a. (held through 30 Sep 2026).
    // Source: cpf.gov.sg news release "CPF interest rates from 1 July to 30 September 2026"
    // (seen in search results; page body not read). SECONDARY 2026-09-23.
    oaInterestRate: 0.025,
    // Accrued interest on CPF used for housing = prevailing OA rate (2.5%).
    // Computed monthly, compounded annually (same as OA interest).
    // Source: cpf.gov.sg "CPF refund when selling or transferring property" (principal +
    // accrued interest). Exact rate/method page returned 404. SECONDARY 2026-09-23.
    accruedInterestRate: 0.025,
    // Graduated (G/G) rates for SPRs in 1st / 2nd year of PR status (from 1 Jan 2026;
    // unchanged since 2016). 3rd year onwards = full rates above.
    // Source: cpf.gov.sg "CPF Contribution Rate Table from 1 January 2026", Tables 2–3. VERIFIED 2026-09-23.
    // OA share for graduated rates assumed equal to SC allocation ratios. UNVERIFIED.
    spr: {
      year1: [
        { maxAgeYears: 60, employer: 0.04, employee: 0.05 },
        { maxAgeYears: 200, employer: 0.035, employee: 0.05 },
      ],
      year2: [
        { maxAgeYears: 55, employer: 0.09, employee: 0.15 },
        { maxAgeYears: 60, employer: 0.06, employee: 0.125 },
        { maxAgeYears: 65, employer: 0.035, employee: 0.075 },
        { maxAgeYears: 200, employer: 0.035, employee: 0.05 },
      ],
    },
    // Low wages: ≤$50 nil; $50–500 employer only; $500–750 employee share phased in as
    // (3 × employee rate) × (TW − $500), e.g. 0.6 for ≤55. Same source, Table 1. VERIFIED 2026-09-23.
    lowWage: { nilUpTo: 50, employerOnlyUpTo: 500, phaseInUpTo: 750, employeeFactor: 3 },
    // Withdrawal Limit = 120% of Valuation Limit, only with a bank loan and after setting aside
    // the BRS. With an HDB loan, CPF can be used up to the full purchase price.
    // Source: cpf.gov.sg "How much CPF savings you can use for your home purchase". VERIFIED 2026-09-23.
    withdrawalLimitMultiple: 1.2,
    // Basic Retirement Sum for the 2026 cohort: $110,200 (FRS $220,400).
    // Source: cpf.gov.sg retirement sum FAQs (search snippet). SECONDARY 2026-09-23.
    basicRetirementSum: 110200,
    // At 55, CPF creates a Retirement Account and moves Special Account, then Ordinary Account
    // savings into it to meet the Full Retirement Sum. After 55, new OA contributions can still pay
    // the housing loan. Source: hdb.gov.sg "CPF rules after 55" (text supplied by the user, VERIFIED
    // 2026-09-26); FRS = 2 × BRS for the 2026 cohort (SECONDARY). Not simulated: the app doesn't track SA.
    fullRetirementSum: 220400,
    // CPF Annual Limit: mandatory + voluntary contributions per calendar year ≤ $37,740.
    // Voluntary top-ups are allocated to OA/SA/MA using the normal allocation rates.
    // Source: cpf.gov.sg "Top up Ordinary, Special and MediSave savings" (search snippet). SECONDARY 2026-09-24.
    annualLimit: 37740,
  },
  hdbLoan: {
    // HDB concessionary rate = CPF OA rate + 0.1%, reviewed quarterly: 2.5% + 0.1% = 2.6% p.a.
    // Source: hdb.gov.sg "Details on the HDB housing loan" (pegging rule, text supplied by the user,
    // VERIFIED 2026-09-26); OA rate 2.5% from CPF releases (SECONDARY).
    interestRate: 0.026,
    // LTV limit for HDB loans lowered from 80% to 75% from the Oct 2024 BTO exercise.
    // Source: hdb.gov.sg Annex C, Oct 2024 BTO sales exercise, footnote 4. VERIFIED 2026-09-23.
    maxLtv: 0.75,
    // Interest rate floor HDB uses to work out the loan amount: the higher of 3.0% p.a. and the
    // prevailing HDB rate. Source: hdb.gov.sg "Details on the HDB housing loan". VERIFIED 2026-09-26.
    stressRate: 0.03,
    // HDB loan repayment period: the shortest of 25 years, 65 minus the average age of the
    // applicants, and the remaining lease minus 20 years (see hdbMaxTenure).
    // Source: hdb.gov.sg "Details on the HDB housing loan". VERIFIED 2026-09-26.
    maxTenureYears: 25,
    // With an HDB loan, the OA balance must go towards the flat before the loan is granted, but
    // each applicant may keep up to $20,000 in their OA.
    // Source: hdb.gov.sg "Use of CPF savings" (HDB housing loan). VERIFIED 2026-09-26.
    oaRetainMax: 20000,
    // "65 years minus the average age of the applicants" caps the tenure (plain average).
    // Source: hdb.gov.sg "Details on the HDB housing loan". VERIFIED 2026-09-26.
    maxAgeAtEnd: 65,
    // Instalments start on the 1st day of the 2nd month after the loan is disbursed (at key
    // collection): keys in March → first instalment 1 May. Partial capital repayments: at least
    // $5,000 in multiples of $1,000 (loans from 1 Apr 2012), no fee or lock-in.
    // Source: hdb.gov.sg "Payments for HDB housing loan" pages (text supplied by the user). VERIFIED 2026-09-26.
    firstInstalmentMonths: 2,
    minPrepay: 5000,
    prepayStep: 1000,
  },
  bankLoan: {
    // Not a policy figure: a typical fixed rate to start from. Edit freely.
    // Market rates in 2026 seen ~1.5–2.5% (secondary). UNVERIFIED 2026-09-23.
    defaultInterestRate: 0.025,
    // LTV for loans from financial institutions: 75%.
    // Source: hdb.gov.sg Annex C, Oct 2024 BTO sales exercise, footnote 4. VERIFIED 2026-09-23.
    maxLtv: 0.75,
    // Minimum cash downpayment with a bank loan (75% LTV): 5% of price.
    // Source: hdb.gov.sg (search snippet: "at least 5% of the flat price ... must be paid in
    // cash ... for an FI loan with 75% LTV limit"). SECONDARY 2026-09-23.
    minCashPct: 0.05,
    // MAS medium-term interest rate floor for TDSR/MSR on bank loans: 4% p.a.
    // Source: MAS release 29 Sep 2022 (MAS site unavailable at check). SECONDARY 2026-09-23.
    stressRate: 0.04,
    // Max bank loan tenure for HDB flats. UNVERIFIED (general knowledge, 30 years).
    maxTenureYears: 30,
    // Banks usually start instalments the month after disbursement. UNVERIFIED (varies by bank).
    firstInstalmentMonths: 1,
    // MAS: for HDB flats, LTV falls to 55% if tenure > 25 years or the loan runs beyond
    // the (income-weighted average) borrower age of 65; min cash rises to 10%.
    // Source: MAS "Loan Tenure and Loan-to-Value Limits" (search snippet) + SDS guides. SECONDARY 2026-09-23.
    reducedLtv: 0.55,
    reducedMinCashPct: 0.1,
    ltvTenureYears: 25,
    ltvMaxAge: 65,
    // With a bank loan, BSD is usually paid by the lawyer from your cash first, then
    // reimbursed from CPF OA. Delay is an estimate. UNVERIFIED.
    bsdReimburseMonths: 2,
  },
  // Mortgage Servicing Ratio cap (HDB flats & ECs): 30% of gross monthly income.
  // Source: MAS "Macroprudential policies in Singapore" (search snippet). SECONDARY 2026-09-23.
  msr: 0.3,
  // Total Debt Servicing Ratio cap: 55% of gross monthly income (bank loans).
  // Source: MAS "Calculating TDSR" (search snippet). SECONDARY 2026-09-23.
  tdsr: 0.55,
  // Buyer's Stamp Duty, residential, for acquisitions on/after 15 Feb 2023.
  // Rounded down to the nearest dollar. Payable within 14 days of signing (the AFL).
  // Source: iras.gov.sg "Buyer's Stamp Duty (BSD)". VERIFIED 2026-09-23.
  bsdTiers: [
    { width: 180000, rate: 0.01 },
    { width: 180000, rate: 0.02 },
    { width: 640000, rate: 0.03 },
    { width: 500000, rate: 0.04 },
    { width: 1500000, rate: 0.05 },
    { width: Infinity, rate: 0.06 },
  ],
  // Option fee by flat type; forms part of the downpayment; paid by NETS (cash).
  // Source: hdb.gov.sg Annex C, Oct 2024 BTO sales exercise, para 12. VERIFIED 2026-09-23.
  // (Exec is not sold as BTO today; treated like 4-room and bigger.)
  optionFee: { '2R': 500, '3R': 1000, '4R': 2000, '5R': 2000, '3Gen': 2000, Exec: 2000 },
  downpayment: {
    hdb: {
      // HDB loan: 10% at AFL. Remaining downpayment (to 25% at 75% LTV) at keys. CPF allowed.
      // Source: hdb.gov.sg Annex C, Oct 2024, para 13 ("10% ... when they sign the AFL ...
      // payable by CPF savings and/or cash"). VERIFIED 2026-09-23.
      standard: { afl: { pct: 0.1, minCashPct: 0 }, keys: { pct: 0.15, minCashPct: 0 } },
      // Staggered Downpayment Scheme (HDB loan or no loan): 5% at AFL, 20% at keys.
      // Source: hdb.gov.sg "Staggered Downpayment Scheme" page (text supplied by the user). VERIFIED 2026-09-26.
      staggered: { afl: { pct: 0.05, minCashPct: 0 }, keys: { pct: 0.2, minCashPct: 0 } },
      // Deferred Income Assessment (uncompleted flat, June 2024 sales exercise onwards):
      // 2.5% at AFL, 22.5% at keys.
      // Source: hdb.gov.sg "Staggered Downpayment Scheme" page, DIA table. VERIFIED 2026-09-26.
      dia: { afl: { pct: 0.025, minCashPct: 0 }, keys: { pct: 0.225, minCashPct: 0 } },
    },
    bank: {
      // Bank loan: 20% at AFL (of which 5% cash), remaining 5% at keys.
      // Source: hdb.gov.sg Annex C, Oct 2024, para 13 (20% at AFL) VERIFIED; 5% cash SECONDARY.
      standard: { afl: { pct: 0.2, minCashPct: 0.05 }, keys: { pct: 0.05, minCashPct: 0 } },
      // Staggered with a bank loan. 75% LTV: 10% at AFL (at least 5% cash), 15% at keys.
      // 55% LTV: 10% at AFL, cash only; 35% at keys.
      // Source: hdb.gov.sg "Staggered Downpayment Scheme" page. VERIFIED 2026-09-26.
      staggered: {
        afl: { pct: 0.1, minCashPct: 0.05 }, keys: { pct: 0.15, minCashPct: 0 },
        reducedLtv: { afl: { pct: 0.1, minCashPct: 0.1 }, keys: { pct: 0.35, minCashPct: 0 } },
      },
      // DIA with a bank loan. 75% LTV: 2.5% at AFL, cash only; 22.5% at keys (at least 2.5% cash).
      // 55% LTV: 2.5% at AFL, cash only; 42.5% at keys (at least 7.5% cash).
      // Source: hdb.gov.sg "Staggered Downpayment Scheme" page, DIA table. VERIFIED 2026-09-26.
      dia: {
        afl: { pct: 0.025, minCashPct: 0.025 }, keys: { pct: 0.225, minCashPct: 0.025 },
        reducedLtv: { afl: { pct: 0.025, minCashPct: 0.025 }, keys: { pct: 0.425, minCashPct: 0.075 } },
      },
    },
  },
  lease: {
    // Age-95 rule: CPF usage (Valuation Limit) and the HDB loan LTV are pro-rated by how far the
    // remaining lease covers the youngest buyer to age 95; no CPF if remaining lease ≤ 20 years.
    // HDB loan tenure ≤ remaining lease − 20. Source: MND "Updated Rules on CPF Usage and HDB
    // Housing Loan" (2019) via search snippets. SECONDARY 2026-09-25.
    coverToAge: 95,
    minYearsForCpf: 20,
    // Completed SBF / open-booking flats: sign the AFL and collect keys within 9 months of booking.
    // Source: hdb.gov.sg "Key Collection" (search snippet). SECONDARY 2026-09-25.
    completedKeysWithinMonths: 9,
  },
  // Staggered Downpayment Scheme eligibility: couples (first-timers, or first-timer + second-timer)
  // who applied for the HFE letter on or before the younger applicant's 30th birthday and booked an
  // uncompleted 5-room or smaller flat; or flat owners right-sizing to an uncompleted 3-room or smaller.
  // Source: hdb.gov.sg "Staggered Downpayment Scheme" page. VERIFIED 2026-09-26.
  staggered: {
    maxYoungerAgeYears: 30,
    flatTypes: ['2R', '3R', '4R', '5R'],
    rightSizerFlatTypes: ['2R', '3R'],
  },
  dia: {
    // At least one applicant must be 30 or below (at HFE application).
    // Source: hdb.gov.sg DIA Annex A, Table A1(b). VERIFIED 2026-09-23.
    maxAgeYears: 30,
    // Income for EHG + HDB loan assessed at the last Probable Completion Date update,
    // "about 3 months before the flat completion". Grant disbursed at key collection.
    // Source: hdb.gov.sg DIA Annex A, Table A2(a). VERIFIED 2026-09-23.
    assessmentMonthsBeforeKeys: 3,
    // Both must be full-time students/NSF, or have completed studies/NS within the last
    // 12 months (at HFE application). Source: DIA Annex A, Table A1(a). VERIFIED 2026-09-23.
    recentGradMonths: 12,
  },
  eligibility: {
    // Household income ceiling for BTO (families): raised from $14,000 to $16,000 from
    // 24 Aug 2026 (National Day Rally 2026). News reports, confirmed by the user 2026-09-24;
    // not yet read on hdb.gov.sg ($14,000 VERIFIED in HDB Feb 2026 BTO Annex B, Table B(1)).
    incomeCeilingFamilies: 16000,
    // HDB loan ceilings on hdb.gov.sg ("HDB housing loan" eligibility, text supplied by the user,
    // VERIFIED 2026-09-26): $16,000 families, $24,000 extended families, $8,000 singles.
    // 2-room Flexi (99-year lease): $7,000 in HDB Feb 2026 Annex B (VERIFIED); may have been
    // raised after 24 Aug 2026. Extended families were $21,000 in Feb 2026, now $24,000.
    incomeCeiling2RFlexi: 7000,
    incomeCeilingExtended: 24000,
    // SC/SPR households pay a $10,000 premium on a new flat (Citizen Top-Up refunds it when
    // the SPR becomes an SC). Source: HDB (search snippet). SECONDARY 2026-09-23.
    scSprPremium: 10000,
    // Enhanced CPF Housing Grant (families), by average gross monthly household income over
    // 12 months. Max $120,000; ceiling $9,000 (unchanged by the Aug 2026 ceiling increase).
    // Source: cpf.gov.sg EHG guide (max + ceiling VERIFIED); band amounts from ohmyhome.com. SECONDARY 2026-09-23.
    ehgFamilies: [
      { upTo: 1500, amount: 120000 }, { upTo: 2000, amount: 110000 }, { upTo: 2500, amount: 105000 },
      { upTo: 3000, amount: 95000 }, { upTo: 3500, amount: 90000 }, { upTo: 4000, amount: 80000 },
      { upTo: 4500, amount: 70000 }, { upTo: 5000, amount: 65000 }, { upTo: 5500, amount: 55000 },
      { upTo: 6000, amount: 50000 }, { upTo: 6500, amount: 40000 }, { upTo: 7000, amount: 30000 },
      { upTo: 7500, amount: 25000 }, { upTo: 8000, amount: 20000 }, { upTo: 8500, amount: 10000 },
      { upTo: 9000, amount: 5000 },
    ],
    // EHG (Singles): used for first-timer + second-timer couples, on HALF the household income
    // (ceiling $4,500). Source: mynicehome.gov.sg (rule VERIFIED); bands from ohmyhome.com SECONDARY.
    ehgSingles: [
      { upTo: 750, amount: 60000 }, { upTo: 1000, amount: 55000 }, { upTo: 1250, amount: 52500 },
      { upTo: 1500, amount: 47500 }, { upTo: 1750, amount: 45000 }, { upTo: 2000, amount: 40000 },
      { upTo: 2250, amount: 35000 }, { upTo: 2500, amount: 32500 }, { upTo: 2750, amount: 27500 },
      { upTo: 3000, amount: 25000 }, { upTo: 3250, amount: 20000 }, { upTo: 3500, amount: 15000 },
      { upTo: 3750, amount: 12500 }, { upTo: 4000, amount: 10000 }, { upTo: 4250, amount: 5000 },
      { upTo: 4500, amount: 2500 },
    ],
    // Worked continuously ≥12 months and working at HFE application; income averaged over the
    // 12 months up to 2 months before the HFE application. Source: mynicehome.gov.sg. VERIFIED 2026-09-23.
    ehgEmploymentMonths: 12,
    ehgIncomeLagMonths: 2,
    // Step-Up CPF Housing Grant: $15,000 for second-timer families moving from public rental / a
    // 2-room flat to a 2-room Flexi or 3-room Standard flat; income ≤ $7,000.
    // Source: HDB Step-Up grant page (search snippet) + guides. SECONDARY 2026-09-23.
    stepUpAmount: 15000,
    stepUpIncomeCeiling: 7000,
    // Singles (SC, 35+) buying a 2-room Flexi: $7,000 until 23 Aug 2026, $8,000 from 24 Aug 2026
    // (National Day Rally 2026). Source: news reports of the change. SECONDARY 2026-09-25.
    incomeCeilingSingles: 8000,
    // Joint Singles Scheme (2–4 singles): assumed the same as the families' ceiling. UNVERIFIED.
    incomeCeilingJointSingles: 16000,
    // Singles and joint singles must be Singapore Citizens aged 35 or above; new flats: 2-room
    // Flexi only (any location). Source: HDB via guides (search snippets). SECONDARY 2026-09-25.
    singlesMinAge: 35,
  },
  // Resale levy (first subsidised flat sold on/after 3 Mar 2006): fixed by its flat type.
  // Cash only (or deducted from the sale proceeds); no CPF or housing loan. Half in some cases
  // (e.g. divorced second-timer buying with a first-timer; singles).
  // Source: HDB figures via nexdoor.sg and several 2026 guides (all agree). SECONDARY 2026-09-26.
  // 3Gen isn't listed anywhere; assumed same as 5-room. UNVERIFIED.
  resaleLevy: { '2R': 15000, '3R': 30000, '4R': 40000, '5R': 45000, '3Gen': 45000, Exec: 50000, EC: 55000 },
  runningCosts: {
    // Reduced S&CC for Singapore Citizen owner-occupiers, per month incl. GST. Varies by town
    // council; these are Bishan-Toa Payoh TC's rates from 1 Jul 2024 (3Gen = Multi-Gen Type B/C).
    // S&CC rebates (1.5–3.5 months a year for eligible households) are not modelled.
    // Source: btptc.org.sg "Service & Conservancy Charges". VERIFIED (one town council) 2026-09-26.
    sccMonthly: { '2R': 36.9, '3R': 53.8, '4R': 71.6, '5R': 90, '3Gen': 124.9, Exec: 124.9 },
    // Owner-occupier residential property tax from 1 Jan 2025: 0% on the first $12,000 of annual
    // value, 4% to $40,000, 6% to $50,000, 10% to $75,000, 14% to $85,000, 20% to $100,000,
    // 26% to $140,000, 32% above. Source: IRAS rates via lovelyhomes.com.sg (IRAS page needs JS). SECONDARY 2026-09-26.
    propertyTaxTiers: [
      { width: 12000, rate: 0 },
      { width: 28000, rate: 0.04 },
      { width: 10000, rate: 0.06 },
      { width: 25000, rate: 0.1 },
      { width: 10000, rate: 0.14 },
      { width: 15000, rate: 0.2 },
      { width: 40000, rate: 0.26 },
      { width: Infinity, rate: 0.32 },
    ],
    // Typical annual values of HDB flats (upper end of published 2026 ranges). Guides disagree and
    // IRAS says 3-room+ owners pay a little tax in 2026, so these may be low. Executive is a guess.
    // Source: lovelyhomes.com.sg / propkaki.com. UNVERIFIED 2026-09-26.
    annualValue: { '2R': 6600, '3R': 9600, '4R': 11400, '5R': 14400, '3Gen': 14400, Exec: 15600 },
  },
  fees: {
    // HDB conveyancing fee (when HDB acts for you): per $1,000 of price, tiered, rounded
    // up to the next $1,000, plus GST. First tier ($0.90 per $1,000 on first $30,000)
    // from cpf.gov.sg "HDB option fee and housing expenses" (VERIFIED). Later tiers
    // ($0.72, $0.60) UNVERIFIED (hdb.gov.sg conveyancing rules page blocked the check).
    conveyancingTiers: [
      { width: 30000, rate: 0.0009 },
      { width: 30000, rate: 0.00072 },
      { width: Infinity, rate: 0.0006 },
    ],
    conveyancingRoundTo: 1000,
    // Minimum legal fee $21.80 incl. GST. SECONDARY 2026-09-23.
    conveyancingMin: 21.8,
    // Singapore GST 9% (since 1 Jan 2024). UNVERIFIED this session (general knowledge).
    gst: 0.09,
    // Caveat registration $64.45 incl. GST, CPF allowed.
    // Source: cpf.gov.sg "HDB option fee and housing expenses". VERIFIED 2026-09-23.
    caveatFee: 64.45,
    // Survey fee range $163.50–$408.75 by flat type (cpf.gov.sg, VERIFIED range);
    // the per-type split below is interpolated. UNVERIFIED per type.
    surveyFee: { '2R': 163.5, '3R': 218, '4R': 299.75, '5R': 354.25, '3Gen': 408.75, Exec: 408.75 },
    // Private lawyer fees when taking a bank loan: ~$2,500–$3,000 (secondary).
    // Not a policy figure: an estimate to edit. UNVERIFIED.
    bankLegalFee: 2500,
    // HDB Fire Insurance 5-year premium (cash only, Etiqa): $1.11–$6.68 by flat type;
    // 4-room ~ $5.94. SECONDARY 2026-09-23; other types interpolated.
    fireInsurance5yr: { '2R': 2.5, '3R': 4.2, '4R': 5.94, '5R': 6.68, '3Gen': 6.68, Exec: 6.68 },
  },
}

/** Human labels + verification status for Advanced settings, keyed by path prefix. */
export interface PolicyMeta {
  label: string
  /** 'pct' values are stored as fractions and displayed as %. */
  unit: 'pct' | 'sgd' | 'years' | 'months' | 'ratio' | 'number'
  status: 'verified' | 'secondary' | 'unverified'
  source: string
}

export const POLICY_META: Record<string, PolicyMeta> = {
  'cpf.bands': { label: 'CPF contribution & OA allocation by age', unit: 'pct', status: 'verified', source: 'cpf.gov.sg contribution & allocation tables, 1 Jan 2026' },
  'cpf.owCeilingMonthly': { label: 'CPF monthly salary ceiling', unit: 'sgd', status: 'verified', source: 'cpf.gov.sg OW ceiling FAQ' },
  'cpf.annualSalaryCeiling': { label: 'CPF annual salary ceiling', unit: 'sgd', status: 'verified', source: 'cpf.gov.sg OW ceiling FAQ' },
  'cpf.oaInterestRate': { label: 'CPF OA interest rate', unit: 'pct', status: 'secondary', source: 'CPF interest rate releases, 2026' },
  'cpf.accruedInterestRate': { label: 'CPF accrued interest rate on housing', unit: 'pct', status: 'secondary', source: 'cpf.gov.sg housing refund pages' },
  'hdbLoan.interestRate': { label: 'HDB loan interest rate (CPF OA rate + 0.1%)', unit: 'pct', status: 'verified', source: 'hdb.gov.sg (peg rule, Sep 2026); OA rate from CPF releases' },
  'hdbLoan.maxLtv': { label: 'HDB loan max LTV', unit: 'pct', status: 'verified', source: 'HDB BTO Annex C, Oct 2024' },
  'hdbLoan.stressRate': { label: 'HDB loan assessment rate floor', unit: 'pct', status: 'verified', source: 'hdb.gov.sg Details on the HDB housing loan (Sep 2026)' },
  'hdbLoan.maxTenureYears': { label: 'HDB loan max tenure (also ≤ 65 − average age, ≤ lease − 20)', unit: 'years', status: 'verified', source: 'hdb.gov.sg Details on the HDB housing loan (Sep 2026)' },
  'hdbLoan.oaRetainMax': { label: 'OA you may keep with HDB loan (per person)', unit: 'sgd', status: 'verified', source: 'hdb.gov.sg Use of CPF savings (Sep 2026)' },
  'bankLoan.defaultInterestRate': { label: 'Bank loan default rate (estimate)', unit: 'pct', status: 'unverified', source: 'Market estimate' },
  'bankLoan.maxLtv': { label: 'Bank loan max LTV', unit: 'pct', status: 'verified', source: 'HDB BTO Annex C, Oct 2024' },
  'bankLoan.minCashPct': { label: 'Bank loan min cash downpayment', unit: 'pct', status: 'secondary', source: 'hdb.gov.sg (snippet)' },
  'bankLoan.stressRate': { label: 'Bank loan MSR/TDSR rate floor', unit: 'pct', status: 'secondary', source: 'MAS release, Sep 2022' },
  'bankLoan.maxTenureYears': { label: 'Bank loan max tenure (HDB flat)', unit: 'years', status: 'unverified', source: 'General knowledge' },
  msr: { label: 'Mortgage Servicing Ratio cap', unit: 'pct', status: 'secondary', source: 'MAS' },
  tdsr: { label: 'Total Debt Servicing Ratio cap', unit: 'pct', status: 'secondary', source: 'MAS' },
  bsdTiers: { label: "Buyer's Stamp Duty tiers", unit: 'pct', status: 'verified', source: 'iras.gov.sg BSD page' },
  optionFee: { label: 'Option fee by flat type', unit: 'sgd', status: 'verified', source: 'HDB BTO Annex C, Oct 2024' },
  'downpayment.hdb.standard': { label: 'HDB loan downpayment (standard)', unit: 'pct', status: 'verified', source: 'HDB BTO Annex C, Oct 2024' },
  'downpayment.hdb.staggered': { label: 'HDB loan downpayment (staggered)', unit: 'pct', status: 'verified', source: 'hdb.gov.sg Staggered Downpayment Scheme page (Sep 2026)' },
  'downpayment.bank.standard': { label: 'Bank loan downpayment (standard)', unit: 'pct', status: 'secondary', source: 'HDB Annex C + secondary' },
  'downpayment.bank.staggered': { label: 'Bank loan downpayment (staggered)', unit: 'pct', status: 'verified', source: 'hdb.gov.sg Staggered Downpayment Scheme page (Sep 2026)' },
  'downpayment.hdb.dia': { label: 'HDB loan downpayment (Deferred Income Assessment)', unit: 'pct', status: 'verified', source: 'HDB DIA Annex A (2024)' },
  'downpayment.bank.dia': { label: 'Bank loan downpayment (Deferred Income Assessment)', unit: 'pct', status: 'verified', source: 'hdb.gov.sg Staggered Downpayment Scheme page (Sep 2026)' },
  'lease.coverToAge': { label: 'Lease must cover youngest buyer to age', unit: 'years', status: 'secondary', source: 'MND 2019 CPF/HDB loan rules (snippet)' },
  'lease.minYearsForCpf': { label: 'No CPF / HDB loan if remaining lease ≤', unit: 'years', status: 'secondary', source: 'MND 2019 CPF/HDB loan rules (snippet)' },
  'lease.completedKeysWithinMonths': { label: 'Completed flats: keys within (months of booking)', unit: 'months', status: 'secondary', source: 'hdb.gov.sg Key Collection (snippet)' },
  'resaleLevy': { label: 'Resale levy by first subsidised flat', unit: 'sgd', status: 'secondary', source: 'HDB figures via 2026 guides' },
  'runningCosts.sccMonthly': { label: 'Service & conservancy charges per month', unit: 'sgd', status: 'verified', source: 'Bishan-Toa Payoh TC (varies by town council)' },
  'runningCosts.annualValue': { label: 'Annual value estimate (for property tax)', unit: 'sgd', status: 'unverified', source: '2026 guides; IRAS sets yours after completion' },
  'runningCosts.propertyTaxTiers': { label: 'Owner-occupier property tax bands', unit: 'sgd', status: 'secondary', source: 'IRAS rates from 1 Jan 2025, via guides' },
  'staggered.maxYoungerAgeYears': { label: 'Staggered downpayment: younger applicant aged ≤ at HFE', unit: 'years', status: 'verified', source: 'hdb.gov.sg Staggered Downpayment Scheme page (Sep 2026)' },
  'dia.maxAgeYears': { label: 'DIA: at least one applicant aged ≤', unit: 'years', status: 'verified', source: 'HDB DIA Annex A' },
  'dia.assessmentMonthsBeforeKeys': { label: 'DIA: income assessed months before keys', unit: 'months', status: 'verified', source: 'HDB DIA Annex A' },
  'dia.recentGradMonths': { label: 'DIA: finished studies/NS within', unit: 'months', status: 'verified', source: 'HDB DIA Annex A' },
  'cpf.spr': { label: 'PR graduated CPF rates (1st/2nd year)', unit: 'pct', status: 'verified', source: 'cpf.gov.sg contribution tables 2–3, 1 Jan 2026' },
  'cpf.lowWage': { label: 'CPF for wages ≤ $750', unit: 'sgd', status: 'verified', source: 'cpf.gov.sg contribution table 1' },
  'cpf.withdrawalLimitMultiple': { label: 'Withdrawal Limit (× Valuation Limit, bank loan)', unit: 'ratio', status: 'verified', source: 'cpf.gov.sg home purchase guide' },
  'cpf.basicRetirementSum': { label: 'Basic Retirement Sum (2026)', unit: 'sgd', status: 'secondary', source: 'cpf.gov.sg FAQ (snippet)' },
  'cpf.fullRetirementSum': { label: 'Full Retirement Sum (2026, moved to RA at 55)', unit: 'sgd', status: 'secondary', source: 'cpf.gov.sg FAQ (snippet); rule verified on hdb.gov.sg' },
  'hdbLoan.maxAgeAtEnd': { label: 'HDB loan: tenure ≤ this minus average age', unit: 'years', status: 'verified', source: 'hdb.gov.sg Details on the HDB housing loan (Sep 2026)' },
  'bankLoan.reducedLtv': { label: 'Bank loan reduced LTV (long tenure / past 65)', unit: 'pct', status: 'secondary', source: 'MAS explainer (snippet)' },
  'bankLoan.reducedMinCashPct': { label: 'Bank loan min cash at reduced LTV', unit: 'pct', status: 'secondary', source: 'SDS guides' },
  'bankLoan.ltvTenureYears': { label: 'Bank loan: tenure above which LTV is reduced', unit: 'years', status: 'secondary', source: 'MAS explainer (snippet)' },
  'bankLoan.ltvMaxAge': { label: 'Bank loan: age above which LTV is reduced', unit: 'years', status: 'secondary', source: 'MAS explainer (snippet)' },
  'bankLoan.bsdReimburseMonths': { label: 'Bank loan: months until BSD reimbursed from CPF', unit: 'months', status: 'unverified', source: 'Estimate' },
  'eligibility.incomeCeilingFamilies': { label: 'BTO income ceiling (families)', unit: 'sgd', status: 'verified', source: 'hdb.gov.sg HDB housing loan eligibility (Sep 2026)' },
  'cpf.annualLimit': { label: 'CPF Annual Limit (mandatory + voluntary)', unit: 'sgd', status: 'secondary', source: 'cpf.gov.sg (snippet)' },
  'eligibility.incomeCeiling2RFlexi': { label: 'Income ceiling: 2-room Flexi (99-yr)', unit: 'sgd', status: 'verified', source: 'HDB Feb 2026 Annex B (may have changed Aug 2026)' },
  'eligibility.incomeCeilingExtended': { label: 'Income ceiling: extended family / 3Gen', unit: 'sgd', status: 'verified', source: 'hdb.gov.sg HDB housing loan eligibility (Sep 2026)' },
  'eligibility.scSprPremium': { label: 'SC/SPR household premium on new flat', unit: 'sgd', status: 'secondary', source: 'HDB (snippet)' },
  'eligibility.ehgFamilies': { label: 'Enhanced CPF Housing Grant (families) by income', unit: 'sgd', status: 'secondary', source: 'Max/ceiling cpf.gov.sg; bands ohmyhome.com' },
  'eligibility.ehgSingles': { label: 'EHG (singles table; FT+ST couples use half income)', unit: 'sgd', status: 'secondary', source: 'mynicehome.gov.sg + ohmyhome.com' },
  'eligibility.ehgEmploymentMonths': { label: 'EHG: months of continuous work needed', unit: 'months', status: 'verified', source: 'mynicehome.gov.sg' },
  'eligibility.ehgIncomeLagMonths': { label: 'EHG: income window ends months before HFE', unit: 'months', status: 'verified', source: 'mynicehome.gov.sg' },
  'eligibility.incomeCeilingSingles': { label: 'Income ceiling: singles', unit: 'sgd', status: 'verified', source: 'hdb.gov.sg HDB housing loan eligibility (Sep 2026)' },
  'eligibility.incomeCeilingJointSingles': { label: 'Income ceiling: Joint Singles Scheme', unit: 'sgd', status: 'unverified', source: 'Assumed = families' },
  'eligibility.singlesMinAge': { label: 'Singles: minimum age', unit: 'years', status: 'secondary', source: 'HDB via guides (snippet)' },
  'eligibility.stepUpAmount': { label: 'Step-Up CPF Housing Grant', unit: 'sgd', status: 'secondary', source: 'HDB (snippet) + guides' },
  'eligibility.stepUpIncomeCeiling': { label: 'Step-Up grant income ceiling', unit: 'sgd', status: 'secondary', source: 'HDB (snippet) + guides' },
  'fees.conveyancingTiers': { label: 'HDB conveyancing fee tiers (per $)', unit: 'ratio', status: 'unverified', source: 'First tier verified on cpf.gov.sg' },
  'fees.conveyancingRoundTo': { label: 'Conveyancing: round price up to', unit: 'sgd', status: 'unverified', source: 'General knowledge' },
  'fees.conveyancingMin': { label: 'Conveyancing minimum fee', unit: 'sgd', status: 'secondary', source: 'Secondary' },
  'fees.gst': { label: 'GST', unit: 'pct', status: 'unverified', source: 'General knowledge' },
  'fees.caveatFee': { label: 'Caveat registration fee', unit: 'sgd', status: 'verified', source: 'cpf.gov.sg housing expenses article' },
  'fees.surveyFee': { label: 'Survey fee by flat type', unit: 'sgd', status: 'unverified', source: 'Range verified on cpf.gov.sg; split interpolated' },
  'fees.bankLegalFee': { label: 'Private lawyer fee (bank loan)', unit: 'sgd', status: 'unverified', source: 'Estimate' },
  'fees.fireInsurance5yr': { label: 'HDB fire insurance (5-yr premium)', unit: 'sgd', status: 'secondary', source: 'Etiqa / secondary' },
}
