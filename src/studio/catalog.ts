/**
 * Flat Studio catalogue data: furniture and fittings, floor and wall finishes, window and door types.
 * The 3D shapes are built in legacy.js from each item's `b` (builder) key.
 */
import { CARP_CATALOG } from './carpentry'
import { FLOOR_SPECS } from './materials'

export interface CatalogItem {
  /** Display name. */
  n: string
  /** Group in the left panel. */
  g: string
  /** Default width and depth, metres. */
  w: number
  d: number
  /** Default colour. */
  c: string
  /** 3D builder key (legacy.js `B`). */
  b: string
  /** Built-in carpentry (counted as carpentry in the schedule). */
  k?: number
  /** Mounted on a wall above the floor (drawn dashed on the plan). */
  elev?: number
  /** Lies flat on the floor (rugs, mats, floor traps). */
  flat?: number
  /** Services (sockets, water points, ducts): not priced as furniture. */
  svc?: number
  /** Wet fixture: compared with the original layout in the Checks tab. */
  wet?: number
  /** Gives light; `ly` is the light's height for a given ceiling height. */
  lamp?: number
  ly?: (H: number) => number
  /** Hangs from the ceiling. */
  top?: number
  /** Imported 3D model (see legacy.js). */
  m?: number
  h?: number
  model?: string
  missing?: number
  /** Made-to-measure carpentry (see carpentry.ts). */
  carp?: number
}

export const CATALOG: Record<string, CatalogItem> = {
  bed_q:{n:'Queen bed',g:'Bedroom',w:1.52,d:1.9,c:'#d9d3c5',b:'bed'},
  bed_k:{n:'King bed',g:'Bedroom',w:1.83,d:1.9,c:'#8a9a7b',b:'bed'},
  bed_s:{n:'Single bed',g:'Bedroom',w:.91,d:1.9,c:'#8aa0ad',b:'bed'},
  bed_ss:{n:'Super single bed',g:'Bedroom',w:1.07,d:1.9,c:'#8aa0ad',b:'bed'},
  ward:{n:'Wardrobe',g:'Bedroom',w:2.0,d:.6,c:'#b9a58a',b:'ward',k:1},
  bside:{n:'Bedside table',g:'Bedroom',w:.45,d:.4,c:'#b9a58a',b:'bside'},
  desk:{n:'Desk',g:'Bedroom',w:1.2,d:.6,c:'#b9a58a',b:'desk'},
  chair:{n:'Chair',g:'Bedroom',w:.45,d:.45,c:'#8a9a7b',b:'chair'},
  sofa:{n:'3-seat sofa',g:'Living',w:2.2,d:.95,c:'#8aa0ad',b:'sofa'},
  arm:{n:'Armchair',g:'Living',w:.85,d:.85,c:'#c89a82',b:'sofa'},
  coffee:{n:'Coffee table',g:'Living',w:1.1,d:.6,c:'#b9a58a',b:'coffee'},
  tvc:{n:'TV console',g:'Living',w:1.8,d:.4,c:'#b9a58a',b:'tvc',k:1},
  dining:{n:'Dining set',g:'Living',w:1.5,d:1.3,c:'#b9a58a',b:'dining'},
  shelf:{n:'Shelf unit',g:'Living',w:.9,d:.3,c:'#b9a58a',b:'shelf',k:1},
  shoe:{n:'Shoe cabinet',g:'Living',w:1.0,d:.35,c:'#f0eee9',b:'shoe',k:1},
  rug:{n:'Rug',g:'Living',w:2.4,d:1.6,c:'#d9d3c5',b:'rug',flat:1},
  plant:{n:'Plant',g:'Living',w:.4,d:.4,c:'#8a9a7b',b:'plant'},
  cab:{n:'Base cabinet',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:'cab',k:1},
  sink:{n:'Sink cabinet',g:'Kitchen',w:1.0,d:.6,c:'#f0eee9',b:'sink',k:1},
  hob:{n:'Hob cabinet',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:'hob',k:1},
  over:{n:'Overhead cabinet',g:'Kitchen',w:.9,d:.35,c:'#f0eee9',b:'over',k:1,elev:1},
  fridge:{n:'Fridge',g:'Kitchen',w:.7,d:.7,c:'#d9d3c5',b:'fridge'},
  washer:{n:'Washer',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:'washer'},
  wc:{n:'Toilet',g:'Bathroom',w:.4,d:.7,c:'#f0eee9',b:'wc'},
  vanity:{n:'Vanity & basin',g:'Bathroom',w:.6,d:.45,c:'#b9a58a',b:'vanity',k:1},
  shower:{n:'Shower',g:'Bathroom',w:.9,d:.9,c:'#f0eee9',b:'shower'},
  aircon:{n:'Air-con unit',g:'Other',w:.9,d:.25,c:'#f0eee9',b:'aircon',elev:1},
  bunk:{n:'Bunk bed',g:'Bedroom',w:1.0,d:2.0,c:'#8aa0ad',b:'bunk'},
  cot:{n:'Baby cot',g:'Bedroom',w:.7,d:1.3,c:'#f0eee9',b:'cot'},
  wardS:{n:'Sliding wardrobe',g:'Bedroom',w:2.4,d:.65,c:'#d9d3c5',b:'wardS',k:1},
  dress:{n:'Dressing table',g:'Bedroom',w:1.0,d:.45,c:'#f0eee9',b:'dress'},
  bookc:{n:'Bookcase',g:'Bedroom',w:.9,d:.3,c:'#b9a58a',b:'bookc',k:1},
  lsofa:{n:'L-shaped sofa',g:'Living',w:2.7,d:1.7,c:'#8aa0ad',b:'lsofa'},
  recl:{n:'Recliner',g:'Living',w:.85,d:.9,c:'#7a5a43',b:'recl'},
  tvwall:{n:'TV wall unit',g:'Living',w:2.6,d:.4,c:'#b9a58a',b:'tvwall',k:1},
  sidet:{n:'Side table',g:'Living',w:.5,d:.5,c:'#b9a58a',b:'sidet'},
  consol:{n:'Console table',g:'Living',w:1.2,d:.35,c:'#b9a58a',b:'consol'},
  disp:{n:'Display cabinet',g:'Living',w:1.0,d:.4,c:'#b9a58a',b:'disp',k:1},
  pouf:{n:'Pouf',g:'Living',w:.5,d:.5,c:'#c89a82',b:'pouf'},
  roundt:{n:'Round dining set',g:'Living',w:1.1,d:1.1,c:'#b9a58a',b:'roundt'},
  piano:{n:'Piano',g:'Living',w:1.5,d:.6,c:'#2b2e31',b:'piano'},
  bplant:{n:'Large plant',g:'Living',w:.6,d:.6,c:'#8a9a7b',b:'bplant'},
  tv:{n:'Wall TV',g:'Living',w:1.2,d:.1,c:'#101213',b:'tv',elev:1},
  art:{n:'Wall art',g:'Living',w:.8,d:.05,c:'#8aa0ad',b:'art',elev:1},
  mat:{n:'Door mat',g:'Living',w:.8,d:.5,c:'#7a5a43',b:'mat',flat:1},
  curtain:{n:'Curtain',g:'Living',w:2.0,d:.1,c:'#cfd8c8',b:'curtain',elev:1},
  blinds:{n:'Roller blind',g:'Living',w:1.5,d:.1,c:'#d9d3c5',b:'blinds',elev:1},
  fridgeL:{n:'Double-door fridge',g:'Kitchen',w:.9,d:.75,c:'#d9d3c5',b:'fridgeL'},
  oventw:{n:'Oven tower',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:'oventw',k:1},
  dishw:{n:'Dishwasher',g:'Kitchen',w:.6,d:.6,c:'#d9dcde',b:'dishw'},
  hood:{n:'Cooker hood',g:'Kitchen',w:.9,d:.5,c:'#c4cacc',b:'hood',elev:1},
  corner:{n:'Corner cabinet',g:'Kitchen',w:.9,d:.6,c:'#f0eee9',b:'corner',k:1},
  dvanity:{n:'Double vanity',g:'Bathroom',w:1.2,d:.5,c:'#b9a58a',b:'dvanity',k:1},
  towel:{n:'Towel rail',g:'Bathroom',w:.6,d:.1,c:'#9aa2a6',b:'towel',elev:1},
  mirror:{n:'Mirror',g:'Bathroom',w:.6,d:.05,c:'#9aa2a6',b:'mirror',elev:1},
  heater:{n:'Water heater',g:'Bathroom',w:.35,d:.35,c:'#f0f0ee',b:'heater',elev:1,wet:1},
  shoeb:{n:'Shoe bench',g:'Other',w:1.0,d:.35,c:'#b9a58a',b:'shoeb'},
  rack:{n:'Laundry rack',g:'Other',w:1.2,d:.5,c:'#d9d3c5',b:'rack'},
  dlamp:{n:'Desk lamp',g:'Lighting',w:.2,d:.2,c:'#e8dcc4',b:'dlamp',lamp:1,ly:()=>.5},
  stairs:{n:'Straight stairs',g:'Other',w:.9,d:3.0,c:'#b9a58a',b:'stairs'},
  dresser:{n:'Chest of drawers',g:'Bedroom',w:.9,d:.45,c:'#b9a58a',b:'dresser'},
  ottoman:{n:'Ottoman',g:'Living',w:.6,d:.6,c:'#c89a82',b:'ottoman'},
  sideb:{n:'Sideboard',g:'Living',w:1.6,d:.4,c:'#b9a58a',b:'sideb',k:1},
  island:{n:'Kitchen island',g:'Kitchen',w:1.6,d:.9,c:'#f0eee9',b:'island',k:1},
  pantry:{n:'Tall pantry',g:'Kitchen',w:.6,d:.6,c:'#f0eee9',b:'pantry',k:1},
  stool:{n:'Bar stool',g:'Kitchen',w:.38,d:.38,c:'#b9a58a',b:'stool'},
  bathtub:{n:'Bathtub',g:'Bathroom',w:1.5,d:.72,c:'#f0eee9',b:'bathtub',wet:1},
  pendant:{n:'Pendant lamp',g:'Lighting',w:.45,d:.45,c:'#d9d3c5',b:'pendant',lamp:1,ly:(H:number)=>H-.8,top:1},
  ceilL:{n:'Ceiling light',g:'Lighting',w:.5,d:.5,c:'#f4f4f2',b:'ceilL',lamp:1,ly:(H:number)=>H-.25,top:1},
  flampL:{n:'Floor lamp',g:'Lighting',w:.35,d:.35,c:'#e8dcc4',b:'flampL',lamp:1,ly:()=>1.5},
  fan:{n:'Ceiling fan',g:'Lighting',w:1.1,d:1.1,c:'#b9a58a',b:'fan',lamp:1,ly:(H:number)=>H-.45,top:1},
  wlight:{n:'Wall light',g:'Lighting',w:.3,d:.1,c:'#3a3d3f',b:'wlight',lamp:1,ly:()=>1.75,elev:1},
  trap:{n:'Floor trap',g:'Services',w:.15,d:.15,c:'#7d8386',b:'trap',flat:1,svc:1,wet:1},
  wpoint:{n:'Water point',g:'Services',w:.12,d:.08,c:'#cfd8dc',b:'wpoint',svc:1,wet:1,elev:1},
  socket:{n:'Power socket',g:'Services',w:.1,d:.06,c:'#f4f4f2',b:'socket',svc:1,elev:1},
  duct:{n:'Pipe duct',g:'Services',w:.5,d:.4,c:'#cfcac0',b:'duct',svc:1},
  sw1:{n:'Light switch',g:'Services',w:.09,d:.05,c:'#f4f4f2',b:'sw1',svc:1,elev:1},
  datapt:{n:'Data / TV point',g:'Services',w:.09,d:.05,c:'#f4f4f2',b:'datapt',svc:1,elev:1},
  acpt:{n:'Aircon point',g:'Services',w:.1,d:.06,c:'#f4f4f2',b:'acpt',svc:1,elev:1},
  downl:{n:'Downlight',g:'Lighting',w:.12,d:.12,c:'#f4f4f2',b:'downl',lamp:1,ly:(H:number)=>H-.05,top:1}
}
for (const k of ['wc', 'shower', 'vanity', 'sink', 'washer']) CATALOG[k].wet = 1
Object.assign(CATALOG, CARP_CATALOG)

export const GROUPS = ['Carpentry', 'Bedroom', 'Living', 'Kitchen', 'Bathroom', 'Lighting', 'Services', 'Other']

export const FLOORS = FLOOR_SPECS
export const WALLS=['#f2f0eb','#dcd7cd','#cfd8c8','#cdd8dd','#e2cfc4','#6a7074'];
export const SW=['#d9d3c5','#b9a58a','#8a9a7b','#8aa0ad','#c89a82','#4a4f52','#f0eee9','#7a5a43'];
export const WTYPES={std:{n:'Standard',sill:.9,wh:1.2},slide:{n:'Sliding',sill:.9,wh:1.2},tall:{n:'Floor to ceiling',sill:.05,wh:2.4},high:{n:'High (bathroom)',sill:1.5,wh:.6},bay:{n:'Bay (projects out)',sill:.6,wh:1.5}};
export const DTYPES={single:'Single swing',double:'Double swing',slide:'Sliding',arch:'Open archway'};
export const FINS = { paint: 'Paint', tile: 'Tile', wood: 'Timber', concrete: 'Concrete' }
