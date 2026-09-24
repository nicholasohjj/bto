import { describe, expect, it } from 'vitest'
import { exportJson, importJson, initialState, isScenario } from '../../state/storage'
import { seedScenario } from '../../state/defaults'
import { runScenario } from '../index'

describe('JSON export / import', () => {
  it('round-trips scenarios and gives clashing ids new ids', () => {
    const s = seedScenario()
    const text = exportJson([s])
    const imported = importJson(text, [s])
    expect(imported).toHaveLength(1)
    expect(imported[0].id).not.toBe(s.id)
    expect({ ...imported[0], id: s.id }).toEqual(s)
    // Same inputs → same results.
    expect(runScenario(imported[0]).summary).toEqual(runScenario(s).summary)
  })
  it('accepts a bare scenario or an array', () => {
    const s = seedScenario()
    expect(importJson(JSON.stringify(s), [])).toHaveLength(1)
    expect(importJson(JSON.stringify([s, s]), [])).toHaveLength(2)
  })
  it('rejects files without scenarios', () => {
    expect(() => importJson('{"hello":1}', [])).toThrow(/No scenarios/)
    expect(() => importJson('not json', [])).toThrow()
  })
  it('seeds four valid scenarios on first load', () => {
    const st = initialState()
    expect(st.scenarios).toHaveLength(4)
    expect(st.scenarios.every(isScenario)).toBe(true)
    expect(st.wizardDone).toBe(false)
  })
})
