import type { FlatType } from '../config/policy'
import type { Milestone } from '../engine/types'

export const FLAT_TYPES: { value: FlatType; label: string }[] = [
  { value: '2R', label: '2-room Flexi' },
  { value: '3R', label: '3-room' },
  { value: '4R', label: '4-room' },
  { value: '5R', label: '5-room' },
  { value: '3Gen', label: '3Gen' },
  { value: 'Exec', label: 'Executive' },
]
export const MILESTONES: { value: Milestone; label: string }[] = [
  { value: 'application', label: 'Application' },
  { value: 'booking', label: 'Booking' },
  { value: 'afl', label: 'AFL signing' },
  { value: 'keys', label: 'Key collection' },
]

/** Guide pages and their shareable addresses. */
export type LearnPage = 'guide' | 'glossary' | 'faq' | 'rules'
export const LEARN_PATHS: Record<LearnPage, string> = { guide: '/guide', glossary: '/glossary', faq: '/faq', rules: '/rules' }
