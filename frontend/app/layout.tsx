import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Sora } from 'next/font/google'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
})

const ibm = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-ibm',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NeuroRun — Coach & Strava',
  description:
    'NeuroRun : entraînement, objectifs et lecture de tes résultats Strava avec un coach IA.',
}

export const viewport: Viewport = {
  themeColor: '#05060a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sora.variable} ${ibm.variable}`}>
      <body>{children}</body>
    </html>
  )
}
