import Link from 'next/link'
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
    <div className="relative flex min-h-dvh w-full lg:min-h-screen">
      {/* Panneau gauche — desktop */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r border-white/[0.07] bg-[#07080f] p-11 xl:p-14 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(252,76,2,0.12) 0%, transparent 42%), linear-gradient(225deg, rgba(103,232,249,0.06) 0%, transparent 38%)',
          }}
        />
        <div className="pointer-events-none absolute -left-32 top-24 h-80 w-80 animate-drift rounded-full bg-brand-orange/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-8 -right-24 h-72 w-72 rounded-full bg-brand-ice/12 blur-[110px]" />

        <div className="relative z-10">
          <Link
            href="/"
            className="inline-flex rounded-xl outline-none ring-offset-2 ring-offset-[#07080f] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-orange/60"
            aria-label="NeuroRun — retour à l’accueil"
          >
            <Mark />
          </Link>
          <div className="mt-14 max-w-md animate-fade-up">
            <p className="kicker mb-5 text-brand-ice/85">{kicker}</p>
            <h2 className="font-display text-3xl font-semibold leading-[1.15] tracking-tight text-white xl:text-4xl">
              Tes sorties. Ton rythme. Une IA qui lit entre les lignes.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-white/48">
              Dialogue avec un coach virtuel dès l’inscription ; lie Strava quand tu veux pour qu’il s’appuie aussi sur
              tes dernières séances — sans remplacer un pro de santé, mais pour ajuster charge et récup au quotidien.
            </p>
            <ul className="mt-10 flex flex-wrap gap-2">
              {['Coach IA', 'Objectifs', 'Strava'].map((label) => (
                <li
                  key={label}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative z-10 text-[11px] leading-relaxed text-white/28">
          Inspiré de l&apos;énergie des apps de course — ton data reste lié à ton compte.
        </p>
      </aside>

      {/* Zone formulaire — centrée verticalement dans la fenêtre */}
      <main className="relative flex min-h-dvh flex-1 flex-col lg:min-h-screen">
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div className="absolute -right-24 top-[23%] h-72 w-72 rounded-full bg-brand-orange/12 blur-[90px]" />
          <div className="absolute -left-28 bottom-[18%] h-64 w-64 rounded-full bg-brand-ice/10 blur-[80px]" />
        </div>

        <div className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6 lg:px-12">
          <div className="flex w-full max-w-[420px] flex-col gap-5 sm:gap-6">
            <div className="flex flex-col items-center gap-3 lg:hidden">
              <Link
                href="/"
                className="text-sm font-medium text-white/45 transition hover:text-white/75"
              >
                ← Retour à l’accueil
              </Link>
              <Link
                href="/"
                className="rounded-xl outline-none ring-offset-2 ring-offset-surface-0 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-orange/60"
                aria-label="NeuroRun — retour à l’accueil"
              >
                <Mark compact />
              </Link>
            </div>

            <div className="auth-card">
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-orange via-brand-ice/75 to-brand-deep opacity-95" />
                <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-orange/10 blur-3xl" />
                <div className="absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-brand-ice/8 blur-3xl" />
              </div>

              <div className="relative z-10 px-6 pb-7 pt-8 sm:px-8 sm:pb-8 sm:pt-9">
                <div className="mb-7 sm:mb-8">
                  <span className="inline-flex items-center rounded-full border border-white/[0.09] bg-white/[0.045] px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ice/90">
                    {kicker}
                  </span>
                  <h1 className="mt-4 font-display text-2xl font-semibold leading-tight tracking-tight text-white sm:text-[1.75rem]">
                    {title}
                  </h1>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-white/50 sm:text-sm">{subtitle}</p>
                </div>

                {children}

                {footer ? (
                  <div className="mt-8 border-t border-white/[0.07] pt-6 sm:mt-9 sm:pt-7">{footer}</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
