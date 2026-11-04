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
  /** Its page under /surroundings/area/, while the site is placed from the town map only. */
  area?: string
}

/** A site HDB has shown ahead of a launch (town map or preview), before its name and prices are out. */
export interface LaunchPreview {
  town: string
  /** The project's name, once HDB has given it ahead of the launch. */
  name?: string
  /** Where it is, in the words of the map. */
  where: string
  /** Flats by type, as HDB's flat mix gives them. */
  flats: Partial<Record<FlatType, number>>
  /** Community Care Apartments for seniors, which aren't a flat type here. */
  cca?: number
  /** Months from the launch to key collection, once HDB has stated it ahead of the launch. */
  waitMonths?: number
  /** How HDB described the wait. */
  waitText?: string
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
  /** Last day of applications ("YYYY-MM-DD"), once HDB has stated it. */
  applicationsClose?: string
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
// Moved to November 2026: VERIFIED 2026-10-31 from HDB's Toa Payoh West master plan release (31 Oct 2026, para 8),
// which names Toa Payoh Hillside as a November 2026 project.
// Sembawang Anchor, Bayshore Oasis and Plantation Dew (names, waits, blocks): VERIFIED 2026-11-01 from HDB's
// Shorter Waiting Time release (1 Nov 2026), which also confirms seven projects and about 7,960 flats (paras 3, 11).
// Projects, prices, waits, subsidy recovery rates, unit counts (7,964 in all) and the 11 Nov closing date: VERIFIED
// 2026-11-04 from each project's HDB Flat Portal page. Prices are the 99-year range's lower end for the cheaper 2-room
// Flexi type, leaving out short leases (2-room Flexi from 15 years; Community Care Apartments, not a flat type here).
// VERIFIED 2026-11-04 from HDB's launch release (4 Nov 2026): flat count, classifications and subsidy recovery (Tables 1-2),
// prices (Table 3), application dates and the HFE date (paras 12, 16). Table 3 gives Bayshore Sails and Oasis one row, the
// lower price of the two, so their separate prices are the portal's. The text supplied had no Toa Payoh Hillside 2-room
// Flexi or 4-room rows, so those two prices are from the portal only; its 4-room comes with and without balconies.
const NOVEMBER_2026: Launch = {
  id: '2026-11',
  name: 'November 2026 BTO',
  applicationMonth: '2026-11',
  applicationsClose: '2026-11-11',
  hfeBy: '2026-09-25',
  towns: ['Bedok', 'Geylang', 'Sembawang', 'Tengah', 'Toa Payoh', 'Yishun'],
  note: '7,964 flats in seven projects, including 256 Community Care Apartments in Toa Payoh, now open from age 55. The 1,310 Shorter Waiting Time flats at Sembawang Anchor have waits under three years, and the other six projects under four. First planned for October 2026.',
  source: 'hdb.gov.sg news release, 17 June 2026, para 17 (towns and flat count); November date from hdb.gov.sg news release, 31 October 2026 (Toa Payoh West master plan), para 8; project count and shorter waits from hdb.gov.sg news release, 1 November 2026 (Shorter Waiting Time flats), paras 3 and 11; projects, prices and dates from hdb.gov.sg news release, 4 November 2026 (November 2026 BTO launch), Tables 1-3 and paras 12 and 16; separate prices, waits and flat mixes from HDB Flat Portal project pages, checked 4 November 2026',
  verified: '2026-11-04',
  previews: [
    {
      area: 'yishun-khatib', town: 'Yishun', name: 'Chencharu Acres', where: 'Yishun Street 82 and Lorong Chencharu, next to Yishun Walk, about a 5-minute walk from Khatib MRT',
      flats: { '2R': 392, '3R': 84, '4R': 462, '5R': 644 },
      waitMonths: 39, waitText: '39 months for blocks 996A to 997C; 41 months for blocks 992A to 995C',
      note: '1,582 flats for sale in 11 blocks of 15 storeys, four of them mixing sold and rental flats, plus one rental block; 2 multi-storey car parks with preschools and roof gardens, a hard court and a central green. A bus interchange, hawker centre and shops are planned in an Integrated Development across the road',
      source: 'HDB Yishun town map, issued June 2026 (checked 2026-10-14); name, mix, wait and blocks from HDB Flat Portal project page (checked 2026-11-04)',
    },
    {
      area: 'toa-payoh-caldecott', town: 'Toa Payoh', name: 'Toa Payoh Hillside', where: 'Toa Payoh Rise and Thomson Road, beside Caldecott MRT (Thomson–East Coast and Circle lines)',
      flats: { '2R': 592, '4R': 584 }, cca: 256,
      waitMonths: 45, waitText: '45 months',
      note: '1,432 flats for sale plus about 230 rental flats (about 1,600 in all) in five blocks of 31 to 43 storeys; the first Community Care Apartments in Toa Payoh, in a block linked to the Active Ageing Centre, Residents’ Network Centre and a sheltered walk to Caldecott MRT (from age 55; priced $88,000 to $201,000 by lease length, from $151,000 on a 40-year lease). Food court, supermarket, fast food restaurant, 4 shops, preschool',
      source: 'HDB Toa Payoh town map, issued June 2026 (checked 2026-10-14); name, blocks, rental count and CCA count (260, up from 240 first announced) from hdb.gov.sg news release, 31 October 2026 (Toa Payoh West master plan), paras 8–10; final mix (256 Community Care Apartments, down from 260), wait and prices from HDB Flat Portal project page (checked 2026-11-04)',
    },
    {
      area: 'tengah-garden-avenue', town: 'Tengah', name: 'Plantation Dew', where: 'Tengah Garden Avenue by the Pan-Island Expressway, about a 10-minute walk from Tengah Plantation and Tengah Park stations on the Jurong Region Line (being built)',
      flats: { '2R': 178, '3R': 84, '4R': 168, '5R': 252, '3Gen': 28 },
      waitMonths: 38, waitText: '3 years and 2 months',
      note: '710 flats in five blocks with sold and rental flats, bounded by Tengah Garden Avenue, Plantation Walk and a future park. White Flats (open plan, no internal walls between living and bedrooms) offered for 3-room, 4-room and, for the first time, 5-room, at $6,000, $8,600 and $9,000 less than the same flat with walls. Eating house, minimart, 4 shops, preschool, kidney dialysis centre; the JE2 station on the Jurong Region Line within walking distance',
      source: 'HDB Tengah town map, issued June 2026 (checked 2026-10-14); name, wait, White Flats and blocks from hdb.gov.sg news release, 1 November 2026 (Shorter Waiting Time flats), paras 8–10; White Flat prices from hdb.gov.sg news release, 4 November 2026 (November 2026 BTO launch), para 9; final mix from HDB Flat Portal project page (checked 2026-11-04)',
    },
    {
      area: 'sembawang-admiralty-lane', town: 'Sembawang', name: 'Sembawang Anchor', where: 'Admiralty Lane and Sembawang Drive, by Jelutung Harbour Park, about a 16-minute walk from Sembawang MRT',
      flats: { '2R': 333, '3R': 96, '4R': 464, '5R': 417 },
      waitMonths: 34, waitText: '2 years and 10 months',
      note: '1,310 flats in six blocks, one of them mixing sold and rental flats, in the new Sembawang North housing area; eating house, supermarket, 5 shops, preschool. A new neighbourhood centre and a one-hectare park are planned nearby; Bukit Canberra (hawker centre, polyclinic, sports hall, gym, pool) and Sun Plaza are in the area',
      source: 'HDB Sembawang town map, issued June 2026 (checked 2026-10-14); name, wait and blocks from hdb.gov.sg news release, 1 November 2026 (Shorter Waiting Time flats), paras 4–5; final mix from HDB Flat Portal project page (checked 2026-11-04)',
    },
    {
      area: 'geylang-aljunied', town: 'Geylang', name: 'Merpati Meadow', where: 'Aljunied Road and Jalan Raya, about a 4-minute walk from Mattar MRT (Downtown line)',
      flats: { '2R': 167, '4R': 271 },
      waitMonths: 39, waitText: '39 months',
      note: '438 flats; preschool',
      source: 'HDB Geylang town map, issued June 2026 (checked 2026-10-14); name, mix and wait from HDB Flat Portal project page (checked 2026-11-04)',
    },
    {
      area: 'bedok-upper-east-coast', town: 'Bedok', name: 'Bayshore Sails', where: 'Upper East Coast Road and Bayshore Road, beside Bayshore MRT (Thomson–East Coast line)',
      flats: { '2R': 890, '3R': 90, '4R': 657 },
      waitMonths: 44, waitText: '44 months',
      note: '1,637 flats, one block mixing sold and rental flats; eating house, 2 shops, 2 preschools, Residents’ Network Centre, Active Ageing Centre (Care), kidney dialysis centre',
      source: 'HDB Bedok town map, issued June 2026 (checked 2026-10-14); name, mix and wait from HDB Flat Portal project page (checked 2026-11-04)',
    },
    {
      area: 'bedok-bayshore-walk', town: 'Bedok', name: 'Bayshore Oasis', where: 'Bayshore Drive and Bayshore Walk, beside Bayshore MRT (Thomson–East Coast line), across Bayshore Drive from the other Bedok site and by East Coast Park',
      flats: { '2R': 347, '4R': 508 },
      waitMonths: 38, waitText: '3 years and 2 months',
      note: '855 flats for sale in four blocks, one of them mixing sold and rental flats; minimart, 2 shops, preschool. A park is proposed next to it, with walking and cycling paths to East Coast Park; Bedok South station (Thomson–East Coast line) is coming',
      source: 'HDB Bedok town map for this site, issued June 2026 (checked 2026-10-14); name, wait, blocks and 855 for sale from hdb.gov.sg news release, 1 November 2026 (Shorter Waiting Time flats), paras 6–7; final mix from HDB Flat Portal project page (checked 2026-11-04)',
    },
  ],
  projects: [
    {
      id: 'chencharu-acres', name: 'Chencharu Acres', town: 'Yishun', classification: 'Standard', area: 'yishun-khatib',
      fromPrices: { '2R': 151000, '3R': 297000, '4R': 353000, '5R': 484000 },
      waitMonths: 39, waitText: '39 months for blocks 996A to 997C; 41 months for blocks 992A to 995C',
    },
    {
      id: 'sembawang-anchor', name: 'Sembawang Anchor', town: 'Sembawang', classification: 'Standard', area: 'sembawang-admiralty-lane',
      fromPrices: { '2R': 156000, '3R': 274000, '4R': 312000, '5R': 479000 },
      waitMonths: 34, waitText: '2 years and 10 months', fittingsIncluded: true,
    },
    {
      id: 'plantation-dew', name: 'Plantation Dew', town: 'Tengah', classification: 'Standard', area: 'tengah-garden-avenue',
      fromPrices: { '2R': 131000, '3R': 266000, '4R': 339000, '5R': 494000, '3Gen': 551000 },
      waitMonths: 38, waitText: '3 years and 2 months',
    },
    {
      id: 'merpati-meadow', name: 'Merpati Meadow', town: 'Geylang', classification: 'Plus', subsidyRecoveryPct: 8, area: 'geylang-aljunied',
      fromPrices: { '2R': 253000, '4R': 545000 },
      waitMonths: 39,
    },
    {
      id: 'bayshore-sails', name: 'Bayshore Sails', town: 'Bedok', classification: 'Plus', subsidyRecoveryPct: 9, area: 'bedok-upper-east-coast',
      fromPrices: { '2R': 208000, '3R': 409000, '4R': 580000 },
      waitMonths: 44,
    },
    {
      id: 'bayshore-oasis', name: 'Bayshore Oasis', town: 'Bedok', classification: 'Plus', subsidyRecoveryPct: 9, area: 'bedok-bayshore-walk',
      fromPrices: { '2R': 230000, '4R': 559000 },
      waitMonths: 38, waitText: '3 years and 2 months',
    },
    {
      id: 'toa-payoh-hillside', name: 'Toa Payoh Hillside', town: 'Toa Payoh', classification: 'Prime', subsidyRecoveryPct: 11, area: 'toa-payoh-caldecott',
      fromPrices: { '2R': 243000, '4R': 558000 },
      waitMonths: 45,
    },
  ],
}

// Sites and flat mixes: VERIFIED 2026-11-04 from HDB's town maps issued November 2026 and the five "Upcoming BTO"
// listings on the HDB Flat Portal (4,280 flats). February 2027, about 4,300 flats, the towns, the Sale of Balance Flats
// and the 15 Dec 2026 HFE date: VERIFIED 2026-11-04 from HDB's launch release (4 Nov 2026), para 19.
const FEBRUARY_2027: Launch = {
  id: '2027-02',
  name: 'February 2027 BTO',
  applicationMonth: '2027-02',
  hfeBy: '2026-12-15',
  towns: ['Bishan', 'Tampines', 'Tengah', 'Toa Payoh'],
  note: 'About 4,300 flats at five sites, with a Sale of Balance Flats exercise of about 5,000 flats at the same time.',
  source: 'HDB town maps issued November 2026 and HDB Flat Portal “Upcoming BTO” listings (sites and flat mixes, checked 4 November 2026); month, flat count and HFE date from hdb.gov.sg news release, 4 November 2026 (November 2026 BTO launch), para 19',
  verified: '2026-11-04',
  previews: [
    {
      area: 'bishan-sin-ming', town: 'Bishan', where: 'Sin Ming Street (being built), between Sin Ming Road and Marymount Road',
      flats: { '2R': 520, '3R': 80, '4R': 470 },
      note: '1,070 flats; supermarket, preschool. HDB’s map shows existing and proposed industries and heavy vehicle parks within 500 m, and the North-South Corridor being built along Marymount Road',
      source: 'HDB Bishan town map, issued November 2026 (checked 2026-11-04)',
    },
    {
      area: 'tampines-changkat', town: 'Tampines', where: 'Tampines Street 11, beside Tampines Changkat Community Club, north of the Pan-Island Expressway',
      flats: { '4R': 90 }, cca: 240,
      note: '330 flats, in one block mixing sold and rental flats; proposed health and medical care next door',
      source: 'HDB Tampines town map, issued November 2026 (checked 2026-11-04)',
    },
    {
      area: 'tampines-upper-changi', town: 'Tampines', where: 'Simei Road and Upper Changi Road East, near Upper Changi MRT (Downtown line)',
      flats: { '2R': 120, '3R': 100, '4R': 120, '5R': 120 },
      note: '460 flats, with two blocks mixing sold and rental flats; eating house, minimart, 4 shops, preschool, Residents’ Network Centre',
      source: 'HDB Tampines town map, issued November 2026 (checked 2026-11-04)',
    },
    {
      area: 'tengah-brickland', town: 'Tengah', where: 'Brickland Crescent, Brickland Close (being built) and Bukit Batok Road, near Brickland MRT (North-South line, being built)',
      flats: { '2R': 410, '3R': 80, '4R': 350, '5R': 440 },
      note: '1,280 flats, with one rental block and three blocks mixing sold and rental flats; preschool, Residents’ Network Centre',
      source: 'HDB Tengah town map, issued November 2026 (checked 2026-11-04)',
    },
    {
      area: 'toa-payoh-mount-pleasant', town: 'Toa Payoh', where: 'Mount Pleasant Avenue, beside the future Mount Pleasant MRT station (Thomson–East Coast line)',
      flats: { '2R': 450, '3R': 90, '4R': 600 },
      note: '1,140 flats, with two blocks mixing sold and rental flats; eating house, preschool, Residents’ Network Centre, fire post, Active Ageing Centre. HDB’s map marks Mount Pleasant station as future, with no opening date',
      source: 'HDB Toa Payoh town map, issued November 2026 (checked 2026-11-04)',
    },
  ],
  projects: [],
}

/** Newest first. */
export const LAUNCHES: Launch[] = [FEBRUARY_2027, NOVEMBER_2026, JUNE_2026]

/**
 * Months between BTO sales exercises, for estimating launches HDB hasn't announced yet.
 * HDB has held three a year (February, July and October in 2025; February, June and November
 * in 2026), so about one every 4 months. UNVERIFIED as a rule: HDB announces each date itself.
 */
export const TYPICAL_MONTHS_BETWEEN_LAUNCHES = 4

/** Typical months from a BTO launch to key collection when HDB doesn't state one. */
export const TYPICAL_WAIT_MONTHS = 46

export function findProject(launchId: string, projectId: string): { launch: Launch; project: LaunchProject } | null {
  const launch = LAUNCHES.find((l) => l.id === launchId)
  const project = launch?.projects.find((p) => p.id === projectId)
  return launch && project ? { launch, project } : null
}
