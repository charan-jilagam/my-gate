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
        line: 'rgb(var(--line) / <alpha-value>)',
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
          50: '#eef7f6',
          100: '#d5ebe9',
          200: '#aad6d3',
          300: '#76bab6',
          400: '#3f9a95',
          500: '#1f7c78',
          600: '#0f5f5c',
          700: '#0c4c4a',
          800: '#0a3a39',
          900: '#082b2a'
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
        lg: '10px'
      },
      boxShadow: {
        pop: '0 12px 32px -12px rgb(8 30 30 / 0.35)'
      }
    }
  },
  plugins: []
}
