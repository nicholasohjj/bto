/**
 * What Flat Studio's panels (left panel, inspector) need from its core (2D plan, 3D view, undo,
 * dialogs). The core in legacy.js builds one `App` and hands it to each panel at start-up.
 */
import type { CatalogItem } from './catalog'
import type { Check } from './checks'
import type { Base, Design, Dim, Item, Opening, Room, Wall, WallInfo } from './model'

export type SelType = 'item' | 'room' | 'wall' | 'open' | 'dim'
export interface Sel { t: SelType; id: string }
export type Ent = Item | Room | Wall | Opening | Dim
export type Tab = 'inspect' | 'schedule' | 'budget' | 'checks'
/** The plan image being traced, in plan metres. */
export interface Under { src: string; x: number; y: number; w: number; h: number; rot: number; op: number; show: boolean }
/** Catalogue entries as the core holds them: data plus a 3D builder, and imported models. */
export type CatEntry = CatalogItem & { b?: unknown }

export interface App {
  /** The design. It's replaced on undo, redo and loading, so read it each time. */
  readonly S: Design
  sel: Sel | null
  ms: Sel[]
  rtab: Tab
  readonly tool: string
  freeAng: boolean
  flush: boolean
  under: Under | null
  readonly view: { cx: number; cy: number; s: number }
  readonly cat: Record<string, CatEntry>
  /** Extra checks from feature modules. */
  readonly checks: ((S: Design) => Check[])[]

  getE(t: SelType, id: string): Ent | undefined
  /** Change the design with an undo step. */
  mut(fn: () => void): void
  checkpoint(): void
  changed(o?: { ui?: boolean }): void
  render2D(): void
  setTool(t: string): void
  setTab(t: string): void
  toast(m: string, ms?: number): void
  dialog(html: string): void
  closeDlg(): void
  fillViews(): void
  snapBase(): Base
  wallInfo(w: Wall): WallInfo
  pruneOps(): void
  fmtT(t: number): string
  /* the traced image */
  renderUnder(): void
  saveUnder(): void
  removeUnder(): void
  pickImage(): void
  /* imported 3D models */
  importModel(): void
  manageModels(): void
}
