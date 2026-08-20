/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: 'var(--panel-bg)',
          card: 'var(--panel-card)',
          border: 'var(--panel-border)',
          hover: 'var(--panel-hover)',
          text: 'var(--panel-text)',
          muted: 'var(--panel-muted)',
          accent: 'var(--panel-accent)',
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
