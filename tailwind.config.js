/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: '#1e1e2e',
          card: '#2a2a3c',
          border: '#3a3a4c',
          hover: '#32324a',
          text: '#e0e0e0',
          muted: '#8888a0',
          accent: '#7c8cf8',
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
