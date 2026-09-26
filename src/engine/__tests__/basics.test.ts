import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY } from '../../config/policy'
import { addMonths, indexToYm, monthsBetween, ymToIndex } from '../dates'
import { buyersStampDuty, conveyancingFee } from '../stampDuty'
import { bandFor, bonusCpf, ordinaryWageCpf, salaryAt } from '../cpf'
import { monthlyInstalment, principalForInstalment } from '../loan'
import { flattenPolicy, resolvePolicy } from '../policyOverrides'
import { blankPartner } from '../../state/defaults'

const P = DEFAULT_POLICY

describe('dates', () => {
  it('round-trips and adds across years', () => {
    expect(indexToYm(ymToIndex('2027-09'))).toBe('2027-09')
    expect(addMonths('2027-11', 3)).toBe('2028-02')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
    expect(monthsBetween('2026-09', '2030-09')).toBe(48)
  })
})

describe("Buyer's Stamp Duty", () => {
  it('matches the CPF example: $700,000 → $15,600', () => {
    expect(buyersStampDuty(700000, P)).toBe(15600)
  })
  it('matches the IRAS worked example: $4,500,100 → $209,606', () => {
    expect(buyersStampDuty(4500100, P)).toBe(209606)
  })
  it('handles tier edges and rounds down', () => {
    expect(buyersStampDuty(180000, P)).toBe(1800)
    expect(buyersStampDuty(360000, P)).toBe(5400)
    expect(buyersStampDuty(480000, P)).toBe(9000)
    expect(buyersStampDuty(180000.99, P)).toBe(1800)
    expect(buyersStampDuty(0, P)).toBe(0)
  })
})

describe('conveyancing fee', () => {
  it('HDB’s example: $345,000 → $219.60, rounded up to $220, plus 9% GST = $239.80', () => {
    expect(conveyancingFee(345000, P)).toBeCloseTo(239.8, 2)
  })
  it('rounds the fee (not the price) up to the next dollar before GST', () => {
    // 30k×0.9‰ + 30k×0.72‰ + 420k×0.6‰ = 300.60 → 301 × 1.09
    expect(conveyancingFee(480000, P)).toBeCloseTo(328.09, 2)
  })
  it('applies the minimum fee', () => {
    expect(conveyancingFee(1000, P)).toBe(21.8)
  })
})

describe('CPF', () => {
  it('uses 37% and the ≤35 OA ratio for a 30-year-old', () => {
    const c = ordinaryWageCpf(5000, 30 * 12, P)
    expect(c.total).toBeCloseTo(1850, 6)
    expect(c.oa).toBeCloseTo(1850 * 0.6217, 6)
  })
  it('caps wages at the $8,000 OW ceiling', () => {
    expect(ordinaryWageCpf(12000, 30 * 12, P).total).toBeCloseTo(2960, 6)
  })
  it('changes band the month after the birthday', () => {
    expect(bandFor(35 * 12, P).oaRatio).toBe(0.6217)
    expect(bandFor(35 * 12 + 1, P).oaRatio).toBe(0.5677)
    expect(bandFor(55 * 12 + 1, P).employer).toBe(0.16)
  })
  it('limits bonus CPF by the annual salary ceiling', () => {
    // OW 8000×12 = 96,000 → AW ceiling 6,000
    const b = bonusCpf(16000, 8000, 30 * 12, P)
    expect(b.subject).toBe(6000)
    expect(b.netBonus).toBeCloseTo(16000 - 6000 * 0.2, 6)
    const small = bonusCpf(5000, 4000, 30 * 12, P)
    expect(small.subject).toBe(5000)
    expect(small.oa).toBeCloseTo(5000 * 0.37 * 0.6217, 6)
  })
  it('applies raises each January', () => {
    const p = { ...blankPartner('A', '2026-09'), grossMonthly: 5000, annualRaisePct: 10 }
    expect(salaryAt(p, '2026-09', '2026-12')).toBe(5000)
    expect(salaryAt(p, '2026-09', '2027-01')).toBeCloseTo(5500, 6)
    expect(salaryAt(p, '2026-09', '2028-06')).toBeCloseTo(6050, 6)
  })
})

describe('loan maths', () => {
  it('computes the level instalment', () => {
    expect(monthlyInstalment(360000, 0.026, 25)).toBeCloseTo(1633.2, 0)
    expect(monthlyInstalment(120000, 0, 10)).toBe(1000)
    expect(monthlyInstalment(0, 0.026, 25)).toBe(0)
  })
  it('inverts back to the principal', () => {
    const m = monthlyInstalment(400000, 0.04, 30)
    expect(principalForInstalment(m, 0.04, 30)).toBeCloseTo(400000, 4)
  })
})

describe('policy overrides', () => {
  it('flattens every numeric leaf including arrays', () => {
    const flat = flattenPolicy()
    expect(flat['hdbLoan.interestRate']).toBe(0.026)
    expect(flat['bsdTiers.0.rate']).toBe(0.01)
    expect(flat['optionFee.4R']).toBe(2000)
    expect(flat['cpf.bands.0.oaRatio']).toBe(0.6217)
  })
  it('applies overrides without touching defaults, ignores unknown paths', () => {
    const p = resolvePolicy({ 'hdbLoan.interestRate': 0.03, 'bsdTiers.0.rate': 0.02, 'nope.x': 1 })
    expect(p.hdbLoan.interestRate).toBe(0.03)
    expect(p.bsdTiers[0].rate).toBe(0.02)
    expect(DEFAULT_POLICY.hdbLoan.interestRate).toBe(0.026)
  })
})
