import type { FlatType } from '../config/policy'
import { findProject, TYPICAL_WAIT_MONTHS, type Launch, type LaunchProject } from '../config/launches'
import { addMonths } from './dates'
import type { Scenario } from './types'

/** The picked project, if the plan has one and it's still in launches.ts. */
export function pickedProject(s: Scenario): { launch: Launch; project: LaunchProject } | null {
  return s.flat.project ? findProject(s.flat.project.launch, s.flat.project.id) : null
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
export function applyProject(d: Scenario, launch: Launch, project: LaunchProject): void {
  const types = offeredTypes(project)
  const single = (d.buyers ?? 'couple') !== 'couple'
  const type = single ? '2R' : types.includes(d.flat.type) ? d.flat.type : nearestType(d.flat.type, types)
  const application = launch.applicationMonth
  const keys = addMonths(application, project.waitMonths ?? TYPICAL_WAIT_MONTHS)
  d.flat.project = { launch: launch.id, id: project.id }
  d.flat.saleType = 'BTO'
  d.flat.completed = false
  d.flat.classification = project.classification
  d.flat.type = type
  d.flat.price = project.fromPrices[type] ?? d.flat.price
  d.flat.remainingLeaseYears = 99
  d.flat.dates = { application, booking: addMonths(application, 5), afl: addMonths(application, 10), keys }
  delete d.flat.hfeMonth
  if (d.exampleFields) d.exampleFields = d.exampleFields.filter((k) => k !== 'flat.price')
}

function nearestType(t: FlatType, types: FlatType[]): FlatType {
  const order: FlatType[] = ['2R', '3R', '4R', '5R', '3Gen', 'Exec']
  const i = order.indexOf(t)
  return [...types].sort((a, b) => Math.abs(order.indexOf(a) - i) - Math.abs(order.indexOf(b) - i))[0]
}
