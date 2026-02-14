/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00fff5',
          pink: '#ff00aa',
          purple: '#bf00ff',
          green: '#00ff88',
          yellow: '#ffff00',
        },
        glass: {
          dark: 'rgba(15, 23, 42, 0.75)',
          light: 'rgba(255, 255, 255, 0.08)',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        neon: '0 0 20px rgba(0, 255, 245, 0.3)',
        'neon-pink': '0 0 20px rgba(255, 0, 170, 0.3)',
      },
      animation: {
        'pulse-neon': 'pulse-neon 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-neon': {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(0, 255, 245, 0.3)' },
          '50%': { opacity: 0.8, boxShadow: '0 0 30px rgba(0, 255, 245, 0.5)' },
        },
      },
    },
  },
  plugins: [],
};
