/** Level monthly instalment for an amortising loan. */
export function monthlyInstalment(principal: number, annualRate: number, tenureYears: number): number {
  if (principal <= 0 || tenureYears <= 0) return 0
  const n = Math.round(tenureYears * 12)
  const r = annualRate / 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

/** Largest principal whose instalment fits within `maxInstalment`. */
export function principalForInstalment(maxInstalment: number, annualRate: number, tenureYears: number): number {
  if (maxInstalment <= 0 || tenureYears <= 0) return 0
  const n = Math.round(tenureYears * 12)
  const r = annualRate / 12
  if (r === 0) return maxInstalment * n
  return (maxInstalment * (1 - Math.pow(1 + r, -n))) / r
}

/** Months needed to repay `principal` with a fixed instalment (Infinity if it never pays off). */
export function monthsToRepay(principal: number, annualRate: number, instalment: number): number {
  if (principal <= 0) return 0
  const r = annualRate / 12
  if (r === 0) return Math.ceil(principal / instalment)
  if (instalment <= principal * r) return Infinity
  return Math.ceil(-Math.log(1 - (r * principal) / instalment) / Math.log(1 + r))
}

/** Split an instalment into interest and principal for a given outstanding balance. */
export function splitInstalment(outstanding: number, annualRate: number, instalment: number) {
  const interest = outstanding * (annualRate / 12)
  const principal = Math.min(outstanding, instalment - interest)
  return { interest, principal }
}
