/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme tokens are CSS variables (see index.css) so light/dark switch without per-class overrides.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        // Sidebar and auth panel: a fixed deep blue-teal in both themes (brand-strong turns light in dark mode).
        side: 'rgb(var(--side) / <alpha-value>)',
        'on-solid': 'rgb(var(--on-solid) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        edge: 'rgb(var(--edge) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          strong: 'rgb(var(--brand-strong) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)'
        },
        amber: {
          DEFAULT: '#F5A800',
          soft: 'rgb(var(--amber-soft) / <alpha-value>)'
        },
        ok: { DEFAULT: 'rgb(var(--ok) / <alpha-value>)', soft: 'rgb(var(--ok-soft) / <alpha-value>)' },
        danger: { DEFAULT: 'rgb(var(--danger) / <alpha-value>)', soft: 'rgb(var(--danger-soft) / <alpha-value>)' },
        info: { DEFAULT: 'rgb(var(--info) / <alpha-value>)', soft: 'rgb(var(--info-soft) / <alpha-value>)' },
        // Kept so any leftover `primary-*` classes still resolve to the brand teal.
        primary: {
          50: '#effaf8',
          100: '#d6f1ec',
          200: '#aee3da',
          300: '#7bcfc4',
          400: '#43b3a8',
          500: '#1f9488',
          600: '#0f766e',
          700: '#115e59',
          800: '#134e4a',
          900: '#0f3c3a'
        }
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px'
      },
      boxShadow: {
        pop: '0 12px 32px -12px rgb(8 30 52 / 0.35)',
        card: '0 1px 2px rgb(14 30 54 / 0.04), 0 10px 28px -14px rgb(30 64 120 / 0.18)',
        lift: '0 2px 4px rgb(14 30 54 / 0.05), 0 18px 34px -14px rgb(30 64 120 / 0.28)'
      }
    }
  },
  plugins: []
}
