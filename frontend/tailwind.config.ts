import type { Config } from 'tailwindcss'

export default {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#05060a',
          1: '#0a0c12',
          2: '#12151f',
          3: '#1a1f2c',
        },
        brand: {
          orange: '#fc4c02',
          deep: '#c73d00',
          ice: '#67e8f9',
        },
      },
      fontFamily: {
        display: ['var(--font-sora)', 'system-ui', 'sans-serif'],
        body: ['var(--font-ibm)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'noise':
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
        'glow-cone':
          'radial-gradient(ellipse 100% 80% at 50% -30%, rgba(252,76,2,0.35), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 20%, rgba(103,232,249,0.12), transparent 45%)',
      },
      boxShadow: {
        lift: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
        insetline: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out forwards',
        drift: 'drift 18s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-2%, 2%) scale(1.03)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
