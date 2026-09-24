/**
 * Place milestone labels above the chart so close-together ones don't
 * overlap. Each label is centred on its line, nudged inside the plot at the
 * edges, and put in the first row where it clears the previous label.
 * Label width is estimated from its length at 11px (~6.2px per character).
 */
export function layoutLabels(
  items: { key: string; index: number; text: string }[],
  pxPerStep: number,
  plotWidth = Infinity,
  gap = 6,
) {
  const rowsRight: number[] = []
  const rows: Record<string, number> = {}
  const x: Record<string, number> = {}
  for (const it of [...items].sort((a, b) => a.index - b.index)) {
    const half = (it.text.length * 6.2 + 4) / 2
    const cx = Math.min(Math.max(it.index * pxPerStep, half), Math.max(half, plotWidth - half))
    let row = rowsRight.findIndex((right) => cx - half > right + gap)
    if (row === -1) {
      row = rowsRight.length
      rowsRight.push(-Infinity)
    }
    rowsRight[row] = cx + half
    rows[it.key] = row
    x[it.key] = cx
  }
  return { rows, x, rowCount: Math.max(1, rowsRight.length) }
}
