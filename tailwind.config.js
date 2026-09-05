/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          // RGB triplets (defined in App.css) + <alpha-value> so Tailwind's
          // opacity modifier works: bg-panel-accent/50 → rgb(var(--panel-accent) / 0.5)
          bg: 'rgb(var(--panel-bg) / <alpha-value>)',
          card: 'rgb(var(--panel-card) / <alpha-value>)',
          border: 'rgb(var(--panel-border) / <alpha-value>)',
          hover: 'rgb(var(--panel-hover) / <alpha-value>)',
          text: 'rgb(var(--panel-text) / <alpha-value>)',
          muted: 'rgb(var(--panel-muted) / <alpha-value>)',
          accent: 'rgb(var(--panel-accent) / <alpha-value>)',
        },
        contrib: {
          0: 'var(--contrib-0)',
          1: 'var(--contrib-1)',
          2: 'var(--contrib-2)',
          3: 'var(--contrib-3)',
          4: 'var(--contrib-4)',
        }
      },
      animation: {
        'slide-up': 'slideUp 0.15s ease-out',
        'fade-in': 'fadeIn 0.1s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      }
    },
  },
  plugins: [],
}
