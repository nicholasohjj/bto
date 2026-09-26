import { lazy, Suspense, type ComponentProps } from 'react'
import type * as Charts from './charts'

// The charting library is about half the app's code, so charts load as a separate file:
// the rest of the page shows straight away, with a same-size placeholder until they arrive.
const load = () => import('./charts')
const Timeline = lazy(() => load().then((m) => ({ default: m.TimelineChart })))
const Compare = lazy(() => load().then((m) => ({ default: m.CompareChart })))

function Placeholder({ className }: { className: string }) {
  return <div className={`${className} w-full animate-pulse rounded-lg bg-surface-2`} aria-label="Loading chart" />
}

export function TimelineChart(props: ComponentProps<typeof Charts.TimelineChart>) {
  return <Suspense fallback={<Placeholder className="h-72 sm:h-80" />}><Timeline {...props} /></Suspense>
}

export function CompareChart(props: ComponentProps<typeof Charts.CompareChart>) {
  return <Suspense fallback={<Placeholder className="h-64" />}><Compare {...props} /></Suspense>
}
