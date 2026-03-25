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
  title: 'RunApp — Coach & Strava',
  description: 'Analyse tes activités Strava avec une IA entraîneur.',
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
