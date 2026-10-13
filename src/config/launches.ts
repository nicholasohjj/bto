/**
 * BTO sales exercises and their projects, for the project picker.
 *
 * Like policy.ts, every launch gives its source and the date it was checked.
 * Prices are HDB's "from" prices (cheapest unit of that type, before grants),
 * so a real unit usually costs more. Waiting times are what HDB stated; where
 * a project has none, `waitMonths` is left out and the picker falls back to a
 * typical BTO wait (the brochure gives the estimated completion date).
 *
 * To add a launch: copy one below, fill it in from the press release (and
 * brochures for waiting times), and add it to LAUNCHES (newest first).
 */

import type { FlatType } from './policy'

export interface LaunchProject {
  id: string
  name: string
  town: string
  classification: 'Standard' | 'Plus' | 'Prime'
  /** Plus/Prime: share of the resale price (or valuation, if higher) paid to HDB on resale. */
  subsidyRecoveryPct?: number
  /** Starting selling price by flat type, excluding grants. Only the types on offer. */
  fromPrices: Partial<Record<FlatType, number>>
  /** Months from the launch to key collection, as stated by HDB. */
  waitMonths?: number
  /** How HDB described the wait, shown next to the key collection estimate. */
  waitText?: string
  /** Prices include floor finishes, internal doors and sanitary fittings. */
  fittingsIncluded?: boolean
}

export interface Launch {
  id: string
  name: string
  /** Month applications open ("YYYY-MM"). */
  applicationMonth: string
  source: string
  verified: string
  projects: LaunchProject[]
}

const JUNE_2026: Launch = {
  id: '2026-06',
  name: 'June 2026 BTO',
  applicationMonth: '2026-06',
  // Applications 17–24 June 2026.
  source: 'hdb.gov.sg news release, 17 June 2026: "HDB Launches 6,952 Flats Across 7 Projects in June 2026 BTO Sales Exercise" (Tables 1–3, paras 2 and 5)',
  verified: '2026-10-13',
  projects: [
    {
      id: 'sembawang-portico', name: 'Sembawang Portico', town: 'Sembawang', classification: 'Standard',
      fromPrices: { '2R': 139000, '3R': 250000, '4R': 302000, '5R': 420000, '3Gen': 468000 },
      waitMonths: 35, waitText: 'Shorter Waiting Time: under 3 years', fittingsIncluded: true,
    },
    {
      id: 'sembawang-brook', name: 'Sembawang Brook', town: 'Sembawang', classification: 'Standard',
      fromPrices: { '2R': 139000, '3R': 250000, '4R': 302000, '5R': 420000, '3Gen': 468000 },
      waitMonths: 35, waitText: 'Shorter Waiting Time: under 3 years', fittingsIncluded: true,
    },
    {
      id: 'woodgrove-acres', name: 'Woodgrove Acres', town: 'Woodlands', classification: 'Standard',
      fromPrices: { '2R': 137000, '3R': 260000, '4R': 353000, '5R': 472000 },
    },
    {
      id: 'kebun-baru-ridge', name: 'Kebun Baru Ridge', town: 'Ang Mo Kio', classification: 'Plus', subsidyRecoveryPct: 8,
      fromPrices: { '2R': 191000, '3R': 380000, '4R': 543000 },
      waitMonths: 37, waitText: '3 years 1 month',
    },
    {
      id: 'kebun-baru-breeze', name: 'Kebun Baru Breeze', town: 'Ang Mo Kio', classification: 'Plus', subsidyRecoveryPct: 8,
      fromPrices: { '2R': 191000, '3R': 380000, '4R': 543000 },
    },
    {
      id: 'lakeview-cascadia', name: 'Lakeview Cascadia', town: 'Bishan', classification: 'Prime', subsidyRecoveryPct: 10,
      fromPrices: { '2R': 216000, '4R': 534000 },
    },
    {
      id: 'berlayar-rise', name: 'Berlayar Rise', town: 'Bukit Merah', classification: 'Prime', subsidyRecoveryPct: 14,
      fromPrices: { '2R': 247000, '3R': 435000, '4R': 592000 },
    },
  ],
}

/** Newest first. */
export const LAUNCHES: Launch[] = [JUNE_2026]

/** Typical months from a BTO launch to key collection when HDB doesn't state one. */
export const TYPICAL_WAIT_MONTHS = 46

export function findProject(launchId: string, projectId: string): { launch: Launch; project: LaunchProject } | null {
  const launch = LAUNCHES.find((l) => l.id === launchId)
  const project = launch?.projects.find((p) => p.id === projectId)
  return launch && project ? { launch, project } : null
}
