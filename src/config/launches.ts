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

/** A site HDB has shown ahead of a launch (town map or preview), before its name and prices are out. */
export interface LaunchPreview {
  town: string
  /** Where it is, in the words of the map. */
  where: string
  /** Flats by type, as HDB's flat mix gives them. */
  flats: Partial<Record<FlatType, number>>
  /** Community Care Apartments for seniors, which aren't a flat type here. */
  cca?: number
  note?: string
  source: string
  /** Its page under /surroundings/area/ (walking, schools, noise), when the site has been placed on the map. */
  area?: string
}

export interface Launch {
  id: string
  name: string
  /** Month applications open ("YYYY-MM"). */
  applicationMonth: string
  /** Apply for the HFE letter, with all documents, by this date ("YYYY-MM-DD") to be processed in time. */
  hfeBy?: string
  /** Announced before its projects: the towns, and anything else known. */
  towns?: string[]
  note?: string
  source: string
  verified: string
  /** Sites HDB has shown before announcing the projects. */
  previews?: LaunchPreview[]
  /** Empty until HDB announces the projects. */
  projects: LaunchProject[]
  /** Applications received, from HDB's application-rate page once the launch closes. */
  applicationRates?: ApplicationRates
}

/** Who a share of the flats is set aside for, as HDB's application-rate page groups applicants. */
export type RateGroup = 'seniors' | 'ftFamilies' | 'ftSingles' | 'stFamilies'

/** One row of HDB's table: some projects' flats of one type (HDB pools some projects, and 5-room with 3Gen). */
export interface ApplicationRateRow {
  projects: string[]
  types: FlatType[]
  units: number
  applicants: number
  /** Applicants per flat set aside for each group, as HDB rounds them (one decimal place). */
  rates: Partial<Record<RateGroup, number>>
}

export interface ApplicationRates {
  /** When the count was taken ("YYYY-MM-DD"): the close of applications. */
  asAt: string
  rows: ApplicationRateRow[]
  /** Median rate of each group, for 2-room Flexi flats and for 3-room and bigger. */
  median: { flexi: Partial<Record<RateGroup, number>>; bigger: Partial<Record<RateGroup, number>> }
  source: string
  verified: string
}

// HDB "Flat Supply & Applications Received", June 2026 BTO, as at 11:59pm on 24 June 2026
// (services-homes.hdb.gov.sg/sales/application-rate/bto/202606, printed by the user 2026-10-16). VERIFIED 2026-10-16.
const JUNE_2026_RATES: ApplicationRates = {
  asAt: '2026-06-24',
  rows: [
    { projects: ['kebun-baru-breeze'], types: ['2R'], units: 377, applicants: 1011, rates: { seniors: 2.6, ftFamilies: 0.1, ftSingles: 4.1, stFamilies: 0.3 } },
    { projects: ['lakeview-cascadia'], types: ['2R'], units: 476, applicants: 2172, rates: { seniors: 3.7, ftFamilies: 0.2, ftSingles: 7.9, stFamilies: 0.2 } },
    { projects: ['berlayar-rise'], types: ['2R'], units: 816, applicants: 3364, rates: { seniors: 2.6, ftFamilies: 0.1, ftSingles: 7.8, stFamilies: 0.4 } },
    { projects: ['sembawang-portico', 'sembawang-brook'], types: ['2R'], units: 461, applicants: 1307, rates: { seniors: 2.3, ftFamilies: 0.4, ftSingles: 4.7, stFamilies: 0.9 } },
    { projects: ['woodgrove-acres'], types: ['2R'], units: 157, applicants: 1131, rates: { seniors: 3.9, ftFamilies: 0.8, ftSingles: 19.3, stFamilies: 2.8 } },
    { projects: ['kebun-baru-ridge'], types: ['3R'], units: 95, applicants: 338, rates: { ftFamilies: 1.4, stFamilies: 24.3 } },
    { projects: ['kebun-baru-breeze', 'kebun-baru-ridge'], types: ['4R'], units: 592, applicants: 1249, rates: { ftFamilies: 1.4, stFamilies: 8.3 } },
    { projects: ['lakeview-cascadia'], types: ['4R'], units: 745, applicants: 3971, rates: { ftFamilies: 3.9, stFamilies: 18.5 } },
    { projects: ['berlayar-rise'], types: ['3R'], units: 172, applicants: 616, rates: { ftFamilies: 1.3, stFamilies: 23.9 } },
    { projects: ['berlayar-rise'], types: ['4R'], units: 988, applicants: 5285, rates: { ftFamilies: 3.3, stFamilies: 23.9 } },
    { projects: ['sembawang-portico', 'sembawang-brook'], types: ['3R'], units: 187, applicants: 286, rates: { ftFamilies: 0.7, stFamilies: 5.0 } },
    { projects: ['sembawang-portico', 'sembawang-brook'], types: ['4R'], units: 764, applicants: 685, rates: { ftFamilies: 0.6, stFamilies: 3.6 } },
    { projects: ['sembawang-portico', 'sembawang-brook'], types: ['5R', '3Gen'], units: 623, applicants: 438, rates: { ftFamilies: 0.4, stFamilies: 3.4 } },
    { projects: ['woodgrove-acres'], types: ['3R'], units: 80, applicants: 377, rates: { ftFamilies: 2.3, stFamilies: 14.3 } },
    { projects: ['woodgrove-acres'], types: ['4R'], units: 162, applicants: 832, rates: { ftFamilies: 4.1, stFamilies: 15.0 } },
    { projects: ['woodgrove-acres'], types: ['5R'], units: 257, applicants: 832, rates: { ftFamilies: 2.5, stFamilies: 9.9 } },
  ],
  median: { flexi: { seniors: 2.6, ftFamilies: 0.2, ftSingles: 7.8, stFamilies: 0.4 }, bigger: { ftFamilies: 1.4, stFamilies: 14.3 } },
  source: 'HDB Flat Supply & Applications Received, June 2026 BTO, as at 24 Jun 2026',
  verified: '2026-10-16',
}

const JUNE_2026: Launch = {
  applicationRates: JUNE_2026_RATES,
  id: '2026-06',
  name: 'June 2026 BTO',
  applicationMonth: '2026-06',
  hfeBy: '2026-05-15',
  // Applications 17–24 June 2026.
  source: 'hdb.gov.sg news release, 17 June 2026: "HDB Launches 6,952 Flats Across 7 Projects in June 2026 BTO Sales Exercise" (Tables 1–3, paras 2, 5 and 10)',
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

// Announced as October 2026 in the June release (para 17), with an HFE deadline of 15 Sep 2026 for that date.
// Since moved to November 2026 (UNVERIFIED: date change not yet read on hdb.gov.sg; HFE deadline for November not known).
const NOVEMBER_2026: Launch = {
  id: '2026-11',
  name: 'November 2026 BTO',
  applicationMonth: '2026-11',
  towns: ['Bedok', 'Geylang', 'Sembawang', 'Tengah', 'Toa Payoh', 'Yishun'],
  note: 'About 7,960 flats, plus Community Care Apartments in Toa Payoh. First planned for October 2026.',
  source: 'hdb.gov.sg news release, 17 June 2026, para 17 (towns and flat count); move to November not yet checked on hdb.gov.sg',
  verified: '2026-10-13',
  previews: [
    {
      area: 'yishun-khatib', town: 'Yishun', where: 'Yishun Street 82 and Lorong Chencharu, next to Yishun Walk, about a 5-minute walk from Khatib MRT',
      flats: { '2R': 390, '3R': 80, '4R': 460, '5R': 650 },
      note: '1,580 flats in one rental block and four blocks mixing sold and rental flats; 2 preschools',
      source: 'HDB Yishun town map, issued June 2026 (checked 2026-10-14)',
    },
    {
      area: 'toa-payoh-caldecott', town: 'Toa Payoh', where: 'Toa Payoh Rise and Thomson Road, beside Caldecott MRT (Thomson–East Coast and Circle lines)',
      flats: { '2R': 590, '4R': 580 }, cca: 260,
      note: '1,430 flats including one rental block; food court, supermarket, fast food restaurant, 4 shops, preschool, Residents’ Network Centre and Active Ageing Centre',
      source: 'HDB Toa Payoh town map, issued June 2026 (checked 2026-10-14)',
    },
    {
      area: 'tengah-garden-avenue', town: 'Tengah', where: 'Tengah Garden Avenue by the Pan-Island Expressway, about a 10-minute walk from Tengah Plantation and Tengah Park stations on the Jurong Region Line (being built)',
      flats: { '2R': 180, '3R': 80, '4R': 170, '5R': 250, '3Gen': 30 },
      note: '710 flats in five blocks mixing sold and rental flats; eating house, minimart, 4 shops, preschool, kidney dialysis centre',
      source: 'HDB Tengah town map, issued June 2026 (checked 2026-10-14)',
    },
    {
      area: 'sembawang-admiralty-lane', town: 'Sembawang', where: 'Admiralty Lane and Sembawang Drive, by Jelutung Harbour Park, about a 16-minute walk from Sembawang MRT',
      flats: { '2R': 330, '3R': 100, '4R': 460, '5R': 420 },
      note: '1,310 flats, one block mixing sold and rental flats; eating house, supermarket, 5 shops, preschool',
      source: 'HDB Sembawang town map, issued June 2026 (checked 2026-10-14)',
    },
    {
      area: 'geylang-aljunied', town: 'Geylang', where: 'Aljunied Road and Jalan Raya, about a 4-minute walk from Mattar MRT (Downtown line)',
      flats: { '2R': 170, '4R': 270 },
      note: '440 flats; preschool',
      source: 'HDB Geylang town map, issued June 2026 (checked 2026-10-14)',
    },
    {
      area: 'bedok-upper-east-coast', town: 'Bedok', where: 'Upper East Coast Road and Bayshore Road, beside Bayshore MRT (Thomson–East Coast line)',
      flats: { '2R': 890, '3R': 90, '4R': 660 },
      note: '1,640 flats, one block mixing sold and rental flats; eating house, 2 shops, 2 preschools, Residents’ Network Centre, Active Ageing Centre (Care), kidney dialysis centre',
      source: 'HDB Bedok town map, issued June 2026 (checked 2026-10-14)',
    },
    {
      area: 'bedok-bayshore-walk', town: 'Bedok', where: 'Bayshore Drive and Bayshore Walk, beside Bayshore MRT (Thomson–East Coast line), across Bayshore Drive from the other Bedok site and by East Coast Park',
      flats: { '2R': 350, '4R': 510 },
      note: '860 flats, one block mixing sold and rental flats; minimart, 2 shops, preschool',
      source: 'HDB Bedok town map for this site, issued June 2026 (checked 2026-10-14)',
    },
  ],
  projects: [],
}

/** Newest first. */
export const LAUNCHES: Launch[] = [NOVEMBER_2026, JUNE_2026]

/** Typical months from a BTO launch to key collection when HDB doesn't state one. */
export const TYPICAL_WAIT_MONTHS = 46

export function findProject(launchId: string, projectId: string): { launch: Launch; project: LaunchProject } | null {
  const launch = LAUNCHES.find((l) => l.id === launchId)
  const project = launch?.projects.find((p) => p.id === projectId)
  return launch && project ? { launch, project } : null
}
