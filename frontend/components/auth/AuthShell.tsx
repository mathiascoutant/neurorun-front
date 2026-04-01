import { Mark } from '@/components/Mark'

export function AuthShell({
  kicker,
  title,
  subtitle,
  children,
  footer,
}: {
  kicker: string
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen lg:flex">
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden border-r border-white/[0.06] bg-surface-1 p-10 lg:flex">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 animate-drift rounded-full bg-brand-orange/25 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-brand-ice/10 blur-[120px]" />
        <Mark />
        <div className="relative z-10 max-w-sm animate-fade-up">
          <p className="kicker mb-4">{kicker}</p>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white">
            Tes sorties. Ton rythme. Une IA qui lit entre les lignes.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/50">
            Dialogue avec un coach virtuel dès l’inscription ; lie Strava quand tu veux pour qu’il s’appuie aussi sur
            tes dernières séances — sans remplacer un pro de santé, mais pour ajuster charge et récup au quotidien.
          </p>
        </div>
        <p className="relative z-10 text-xs text-white/30">Inspiré de l&apos;énergie des apps de course — ton data reste lié à ton compte.</p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center p-5 sm:p-10">
        <div className="mb-8 w-full max-w-md lg:hidden">
          <Mark />
        </div>
        <div className="panel w-full max-w-md p-8 sm:p-10 animate-fade-up">
          <p className="kicker mb-2 text-brand-orange lg:hidden">{kicker}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-white/50">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-white/[0.06] pt-6">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
