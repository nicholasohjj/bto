export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[11px] text-muted">
        Estimates only — not financial advice. Policies change; verify figures with HDB, CPF Board, IRAS and your bank before committing.
      </p>
    )
  }
  return (
    <div role="note" className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-ink-2">
      <b className="text-ink">Estimates only.</b> This tool simplifies real rules (e.g. monthly rather than daily timing, CPF interest credited yearly,
      grant timing assumed). It is not financial advice. Always verify amounts and dates with <b>HDB</b> (your HFE letter and payment notices),
      <b> CPF Board</b>, <b>IRAS</b> and your <b>bank</b>. Policy figures used are listed, with sources, under Advanced settings.
    </div>
  )
}
