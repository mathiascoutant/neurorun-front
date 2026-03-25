export function Mark({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-orange via-brand-deep to-surface-0 shadow-[0_0_16px_rgba(252,76,2,0.3)]">
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
          <span className="font-display text-sm font-bold tracking-tight">N</span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold leading-tight tracking-tight">NeuroRun</p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-white/40">Strava × IA</p>
        </div>
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-orange via-brand-deep to-surface-0 shadow-[0_0_24px_rgba(252,76,2,0.35)]">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
        <span className="font-display text-lg font-bold tracking-tight">N</span>
      </div>
      <div>
        <p className="font-display text-lg font-semibold leading-none tracking-tight">NeuroRun</p>
        <p className="mt-0.5 text-[11px] font-medium text-white/40">Strava × coach IA</p>
      </div>
    </div>
  )
}
