const fmt0 = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0, minimumFractionDigits: 0 })

/** "$12,345" (negative as "-$12,345"). SGD, no cents. */
export function money(n: number): string {
  return fmt0.format(Math.round(n)).replace('SGD', '$').replace(/ /g, '')
}

/** "$12.3k" / "$1.2M" for chart axes. */
export function moneyShort(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`
  return `${sign}$${Math.round(a)}`
}
