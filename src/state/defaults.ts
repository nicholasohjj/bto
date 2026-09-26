import { DEFAULT_POLICY } from '../config/policy'
import { addMonths, currentYm } from '../engine/dates'
import type { CostItem, Partner, Scenario, YearMonth } from '../engine/types'

export function newId(prefix = 'id'): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}-${rnd.slice(0, 8)}`
}

/** Standard cost items every BTO purchase has (amounts auto-computed where possible). */
export function defaultCosts(): CostItem[] {
  return [
    { id: 'option-fee', label: 'Option fee', kind: 'optionFee', amount: 0, auto: true, when: { milestone: 'booking' }, funding: 'cashOnly', payer: 'joint' },
    { id: 'bsd', label: "Buyer's Stamp Duty", kind: 'bsd', amount: 0, auto: true, when: { milestone: 'afl' }, funding: 'cpfAllowed', payer: 'joint' },
    { id: 'legal', label: 'Legal / conveyancing fees', kind: 'legal', amount: 0, auto: true, when: { milestone: 'keys' }, funding: 'cpfAllowed', payer: 'joint' },
    { id: 'survey', label: 'Survey fee', kind: 'survey', amount: 0, auto: true, when: { milestone: 'keys' }, funding: 'cpfAllowed', payer: 'joint' },
    { id: 'caveat', label: 'Caveat registration', kind: 'caveat', amount: 0, auto: true, when: { milestone: 'keys' }, funding: 'cpfAllowed', payer: 'joint' },
    { id: 'fire', label: 'HDB fire insurance (5 yrs)', kind: 'fire', amount: 0, auto: true, when: { milestone: 'keys' }, funding: 'cashOnly', payer: 'joint', recurrence: { everyMonths: 60, times: 6 } },
    { id: 'hps', label: 'Home Protection Scheme (yearly)', kind: 'hps', amount: 300, auto: false, when: { milestone: 'keys' }, funding: 'cpfAllowed', payer: 'joint', recurrence: { everyMonths: 12, times: 30 } },
    { id: 'reno', label: 'Renovation', kind: 'reno', amount: 40000, auto: false, when: { milestone: 'keys', offsetMonths: 1 }, funding: 'cashOnly', payer: 'joint', delayable: true },
    { id: 'furniture', label: 'Furniture & appliances', kind: 'furniture', amount: 15000, auto: false, when: { milestone: 'keys', offsetMonths: 2 }, funding: 'cashOnly', payer: 'joint', delayable: true },
    { id: 'moving', label: 'Moving costs', kind: 'moving', amount: 1000, auto: false, when: { milestone: 'keys', offsetMonths: 3 }, funding: 'cashOnly', payer: 'joint', delayable: true },
    ...runningCostDefaults(),
  ]
}

/** Default costs added in version 2 of the default cost list. */
export const COST_DEFAULTS_VERSION = 2
export function runningCostDefaults(): CostItem[] {
  return [
    // $0 unless you're second-timers and have picked your first subsidised flat (Flat section).
    { id: 'resale-levy', label: 'Resale levy (second-timers)', kind: 'resaleLevy', amount: 0, auto: true, when: { milestone: 'keys' }, funding: 'cashOnly', payer: 'joint' },
    // Monthly from key collection, for 30 years like the Home Protection Scheme.
    { id: 'scc', label: 'Service & conservancy charges (monthly)', kind: 'scc', amount: 0, auto: true, when: { milestone: 'keys' }, funding: 'cashOnly', payer: 'joint', recurrence: { everyMonths: 1, times: 360 } },
    // Billed yearly; the first full bill is assumed a year after keys.
    { id: 'property-tax', label: 'Property tax (yearly)', kind: 'propertyTax', amount: 0, auto: true, when: { milestone: 'keys', offsetMonths: 12 }, funding: 'cashOnly', payer: 'joint', recurrence: { everyMonths: 12, times: 30 } },
  ]
}

/** Bring a saved plan's cost list up to date: add default items it predates (once). */
export function upgradeCosts(s: Scenario): Scenario {
  if ((s.costDefaultsVersion ?? 1) >= COST_DEFAULTS_VERSION) return s
  const have = new Set(s.costs.map((c) => c.kind))
  return { ...s, costDefaultsVersion: COST_DEFAULTS_VERSION, costs: [...s.costs, ...runningCostDefaults().filter((c) => !have.has(c.kind))] }
}

export function blankPartner(id: 'A' | 'B', start: YearMonth): Partner {
  return {
    id,
    name: id === 'A' ? 'Partner A' : 'Partner B',
    birthYearMonth: addMonths(start, -28 * 12),
    grossMonthly: 4500,
    annualRaisePct: 3,
    cpfOA: 25000,
    cash: 20000,
    monthlyCashSavings: 1200,
    bonuses: [{ months: 1, paidInMonth: 12 }],
    bonusSavedPct: 80,
    otherMonthlyDebt: 0,
  }
}

/** Empty-ish scenario used by the setup wizard. */
export function newScenario(name = 'Our BTO plan', start: YearMonth = currentYm()): Scenario {
  const application = addMonths(start, 1)
  return {
    schemaVersion: 1,
    costDefaultsVersion: COST_DEFAULTS_VERSION,
    id: newId('sc'),
    name,
    startMonth: start,
    partners: [blankPartner('A', start), blankPartner('B', start)],
    flat: {
      price: 450000,
      type: '4R',
      classification: 'Standard',
      dates: {
        application,
        booking: addMonths(application, 5),
        afl: addMonths(application, 10),
        keys: addMonths(application, 46),
      },
      grants: [],
    },
    financing: {
      loanType: 'HDB',
      ltv: DEFAULT_POLICY.hdbLoan.maxLtv,
      rate: DEFAULT_POLICY.hdbLoan.interestRate,
      tenureYears: 25,
      staggered: false,
      cpfUsagePct: 100,
      mortgageFrom: 'cpfFirst',
      jointSplitA: 50,
      poolCash: true,
    },
    costs: defaultCosts(),
    interim: { mode: 'parents', monthlyCost: 0 },
    policyOverrides: {},
  }
}

/**
 * A new plan from the setup wizard: like newScenario, plus the Enhanced CPF Housing Grant
 * worked out from your income (it's $0 if you're not eligible, so it's safe to include).
 */
export function newPlan(name?: string): Scenario {
  const s = newScenario(name)
  s.flat.grants = [{ id: 'ehg', name: 'Enhanced CPF Housing Grant', amount: 0, auto: 'EHG', splitA: 50, when: { milestone: 'keys' } }]
  return s
}

/** The example scenario shown on first load. Fixed dates so tests are stable. */
export function seedScenario(): Scenario {
  const start = '2026-09'
  const s = newScenario('Example: Tengah 4-room, HDB loan', start)
  s.id = 'seed-example'
  s.partners = [
    {
      ...blankPartner('A', start), name: 'Wei Ming', birthYearMonth: '1998-04',
      grossMonthly: 4400, annualRaisePct: 3, cpfOA: 31000, cash: 14000, monthlyCashSavings: 900,
      bonuses: [{ months: 1, paidInMonth: 12 }], bonusSavedPct: 80,
    },
    {
      ...blankPartner('B', start), name: 'Hui Min', birthYearMonth: '1999-01',
      grossMonthly: 4000, annualRaisePct: 3, cpfOA: 26000, cash: 11000, monthlyCashSavings: 700,
      bonuses: [{ months: 1.5, paidInMonth: 3 }], bonusSavedPct: 80,
    },
  ]
  s.flat = {
    price: 480000,
    type: '4R',
    classification: 'Standard',
    dates: { application: '2026-10', booking: '2027-03', afl: '2027-09', keys: '2030-09' },
    grants: [{ id: 'ehg', name: 'Enhanced CPF Housing Grant', amount: 0, auto: 'EHG', splitA: 50, when: { milestone: 'keys' } }],
  }
  s.costs = [
    ...defaultCosts(),
    { id: 'wedding', label: 'Wedding banquet', kind: 'custom', amount: 45000, auto: false, when: { date: '2027-11' }, funding: 'cashOnly', payer: 'joint', delayable: true },
    { id: 'hongbao', label: 'Wedding hongbao received', kind: 'inflow', amount: 25000, auto: false, when: { date: '2027-11' }, funding: 'cashOnly', payer: 'joint', delayable: false },
    { id: 'rent-after-wedding', label: 'Rent a room after the wedding', kind: 'custom', amount: 1800, auto: false, when: { date: '2028-01' }, funding: 'cashOnly', payer: 'joint', delayable: false, recurrence: { everyMonths: 1, times: 32 } },
    { id: 'honeymoon', label: 'Honeymoon', kind: 'custom', amount: 8000, auto: false, when: { date: '2027-12' }, funding: 'cashOnly', payer: 'joint', delayable: true },
  ]
  s.costs = s.costs.map((c) => (c.id === 'reno' ? { ...c, amount: 55000 } : c))
  return s
}

/** Example: final-year students booking with Deferred Income Assessment. */
export function seedDiaScenario(): Scenario {
  const start = '2026-09'
  const s = newScenario('Example: students, Deferred Income Assessment', start)
  s.id = 'seed-dia'
  s.partners = [
    {
      ...blankPartner('A', start), name: 'Jun Kai', birthYearMonth: '2003-06',
      grossMonthly: 3800, annualRaisePct: 4, cpfOA: 3000, cash: 9000, monthlyCashSavings: 1200,
      workStartMonth: '2027-07', preWorkMonthlySavings: 300, bonuses: [{ months: 1, paidInMonth: 12 }], bonusSavedPct: 80,
    },
    {
      ...blankPartner('B', start), name: 'Mei Ling', birthYearMonth: '2004-02',
      grossMonthly: 3500, annualRaisePct: 4, cpfOA: 0, cash: 6000, monthlyCashSavings: 1000,
      workStartMonth: '2027-07', preWorkMonthlySavings: 250, bonuses: [{ months: 1, paidInMonth: 12 }], bonusSavedPct: 80,
    },
  ]
  s.flat = {
    price: 420000,
    type: '4R',
    classification: 'Standard',
    dates: { application: '2026-10', booking: '2027-03', afl: '2027-09', keys: '2031-03' },
    grants: [{ id: 'ehg', name: 'Enhanced CPF Housing Grant', amount: 0, auto: 'EHG', splitA: 50, when: { milestone: 'keys' } }],
  }
  s.financing = { ...s.financing, deferredIncomeAssessment: true }
  s.costs = s.costs.map((c) => (c.id === 'reno' ? { ...c, amount: 45000 } : c))
  return s
}

/** Example: open booking of a completed flat — keys within months, full downpayment at once. */
export function seedOpenBookingScenario(): Scenario {
  const s = structuredClone(seedScenario())
  s.id = 'seed-obf'
  s.name = 'Example: open booking, completed 4-room'
  s.flat = {
    ...s.flat,
    saleType: 'OBF',
    completed: true,
    remainingLeaseYears: 95,
    price: 420000,
    dates: { application: '2026-10', booking: '2026-10', afl: '2027-01', keys: '2027-01' },
  }
  // A completed flat needs the whole downpayment at once, so this couple has saved more.
  s.partners = [
    { ...s.partners[0], cpfOA: 52000, cash: 34000 },
    { ...s.partners[1], cpfOA: 46000, cash: 30000 },
  ]
  // No wait for the flat, so no rent after the wedding; a lighter renovation right after keys.
  s.costs = s.costs
    .filter((c) => c.id !== 'rent-after-wedding')
    .map((c) => (c.id === 'reno' ? { ...c, amount: 35000, when: { milestone: 'keys' as const, offsetMonths: 2 } } : c.id === 'furniture' ? { ...c, amount: 12000 } : c))
  return s
}

/** Example: a single, 37, buying a 2-room Flexi BTO. */
export function seedSingleScenario(): Scenario {
  const start = '2026-09'
  const s = newScenario('Example: single, 2-room Flexi BTO', start)
  s.id = 'seed-single'
  s.buyers = 'single'
  s.partners = [
    {
      ...blankPartner('A', start), name: 'You', birthYearMonth: '1989-05',
      grossMonthly: 4200, annualRaisePct: 2.5, cpfOA: 68000, cash: 38000, monthlyCashSavings: 1100,
      bonuses: [{ months: 1, paidInMonth: 12 }], bonusSavedPct: 80,
    },
    blankPartner('B', start),
  ]
  s.flat = {
    price: 210000,
    type: '2R',
    classification: 'Standard',
    dates: { application: '2026-10', booking: '2027-03', afl: '2027-09', keys: '2030-09' },
    grants: [{ id: 'ehg', name: 'Enhanced CPF Housing Grant', amount: 0, auto: 'EHG', splitA: 100, when: { milestone: 'keys' } }],
  }
  s.costs = s.costs.map((c) => (c.id === 'reno' ? { ...c, amount: 25000 } : c.id === 'furniture' ? { ...c, amount: 8000 } : c))
  return s
}
