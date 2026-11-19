/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theatre: {
          darkest: '#090514',
          dark: '#120b24',
          midnight: '#1a103c',
          surface: '#24174a',
          card: 'rgba(36, 23, 74, 0.7)',
          gold: '#f59e0b',
          amber: '#fbbf24',
          warmGlow: '#fef3c7',
          pink: '#f43f5e',
          softPink: '#fb7185',
          blush: '#fda4af',
          neonPink: '#ec4899',
        },
      },
      boxShadow: {
        'glow-gold': '0 0 25px -5px rgba(245, 158, 11, 0.35)',
        'glow-pink': '0 0 25px -5px rgba(244, 63, 94, 0.35)',
        'glow-theatre': '0 0 50px -10px rgba(139, 92, 246, 0.3)',
        'screen-glow': '0 20px 80px 20px rgba(251, 191, 36, 0.15)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        'xs': '2px',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2.5s infinite linear',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%': { opacity: '0.4' },
          '100%': { opacity: '0.85' },
        },
      },
    },
  },
  plugins: [],
}

