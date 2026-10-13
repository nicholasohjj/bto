import type { FlatType, Policy } from '../config/policy'
import { findProject, LAUNCHES, TYPICAL_WAIT_MONTHS, type Launch, type LaunchProject } from '../config/launches'
import { affordablePrice, checkPrice, type AffordLimit } from './afford'
import { addMonths } from './dates'
import { resolvePolicy } from './policyOverrides'
import { normalizeScenario } from './saleType'
import type { Scenario, YearMonth } from './types'

/** The picked project, if the plan has one and it's still in launches.ts. */
export function pickedProject(s: Scenario): { launch: Launch; project: LaunchProject } | null {
  return s.flat.project?.id ? findProject(s.flat.project.launch, s.flat.project.id) : null
}

/** The picked launch (with or without a project). */
export function pickedLaunch(s: Scenario): Launch | null {
  return LAUNCHES.find((l) => l.id === s.flat.project?.launch) ?? null
}

/** Flat types on offer in a project, in the order HDB lists them. */
export function offeredTypes(p: LaunchProject): FlatType[] {
  return (['2R', '3R', '4R', '5R', '3Gen'] as FlatType[]).filter((t) => p.fromPrices[t] !== undefined)
}

/**
 * Fills the flat from a launch project (mutates the draft): BTO, its classification,
 * the starting price for the flat type (kept if on offer, else the nearest one; singles get
 * 2-room Flexi), and dates from the launch month and HDB's stated wait (else a typical one).
 * Booking and AFL use the usual gaps after the launch.
 */
export function applyProject(d: Scenario, launch: Launch, project: LaunchProject, opts: { type?: FlatType; applicationMonth?: YearMonth } = {}): void {
  const types = offeredTypes(project)
  const single = (d.buyers ?? 'couple') !== 'couple'
  const want = opts.type ?? d.flat.type
  const type = single ? '2R' : types.includes(want) ? want : nearestType(want, types)
  d.flat.project = { launch: launch.id, id: project.id }
  d.flat.classification = project.classification
  d.flat.type = type
  d.flat.price = project.fromPrices[type] ?? d.flat.price
  if (d.exampleFields) d.exampleFields = d.exampleFields.filter((k) => k !== 'flat.price')
  setLaunchDates(d, opts.applicationMonth ?? launch.applicationMonth, project.waitMonths)
}

/**
 * BTO dates from the month applications open: booking and AFL at the usual gaps,
 * keys after `waitMonths` (else a typical wait). Used for a launch whose projects
 * aren't announced yet, too.
 */
export function setLaunchDates(d: Scenario, application: YearMonth, waitMonths = TYPICAL_WAIT_MONTHS): void {
  d.flat.saleType = 'BTO'
  d.flat.completed = false
  d.flat.remainingLeaseYears = 99
  d.flat.dates = { application, booking: addMonths(application, 5), afl: addMonths(application, 10), keys: addMonths(application, waitMonths) }
  delete d.flat.hfeMonth
}

export interface ProjectFit {
  project: LaunchProject
  type: FlatType
  fromPrice: number
  keys: YearMonth
  /** The starting price works: no cash shortfall, MSR/TDSR within limits. */
  ok: boolean
  /** Highest price that works with this project's dates (undefined if nothing does). */
  maxPrice?: number
  aboveMax: boolean
  /** Why the starting price fails, and when cash first runs short. */
  limit?: AffordLimit
  firstShortYm?: YearMonth
}

/**
 * "Which projects fit?": every project and flat type in a launch, checked against the plan
 * at its starting price (singles: 2-room Flexi only). Everything else in the plan stays as is.
 * `applicationMonth` moves the launch (e.g. to next month for one that has closed, whose
 * payments would otherwise count as already paid).
 */
export function launchFit(raw: Scenario, launch: Launch, opts: { applicationMonth?: YearMonth } = {}, policy: Policy = resolvePolicy(raw.policyOverrides)): ProjectFit[] {
  const single = (raw.buyers ?? 'couple') !== 'couple'
  const memo = new Map<string, ReturnType<typeof affordablePrice>>()
  const out: ProjectFit[] = []
  for (const project of launch.projects) {
    for (const type of offeredTypes(project)) {
      if (single && type !== '2R') continue
      const d = structuredClone(raw)
      applyProject(d, launch, project, { type, applicationMonth: opts.applicationMonth })
      const fromPrice = d.flat.price
      // Projects with the same dates and flat type afford the same; only the starting price differs.
      const key = `${type}|${d.flat.classification}|${d.flat.dates.keys}`
      if (!memo.has(key)) memo.set(key, affordablePrice(d, { max: 2_000_000 }, policy))
      const r = memo.get(key)!
      const ok = r.maxPrice !== undefined && r.maxPrice >= fromPrice
      const fail = ok ? undefined : checkPrice(normalizeScenario(d), fromPrice, policy)
      out.push({
        project, type, fromPrice, keys: d.flat.dates.keys, ok,
        maxPrice: r.maxPrice, aboveMax: r.aboveMax,
        limit: fail?.limit, firstShortYm: fail?.firstShortYm,
      })
    }
  }
  return out
}

function nearestType(t: FlatType, types: FlatType[]): FlatType {
  const order: FlatType[] = ['2R', '3R', '4R', '5R', '3Gen', 'Exec']
  const i = order.indexOf(t)
  return [...types].sort((a, b) => Math.abs(order.indexOf(a) - i) - Math.abs(order.indexOf(b) - i))[0]
}
