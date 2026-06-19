/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        poe: {
          bg: '#0f0d14',
          bgLight: '#15121c',
          surface: '#1b1722',
          surfaceHighlight: '#231f2e',
          border: '#30283a',
          borderHighlight: '#3d3548',
          text: '#f1e9dc',
          textMuted: '#8f879b',
          textDim: '#5c5468',
          highlight: '#d48a35',
          positive: '#5cc878',
          negative: '#e05d5d',
          warning: '#e2b84f',
          // 稀有度
          normal: '#c8c8c8',
          magic: '#8888ff',
          rare: '#e2b84f',
          unique: '#d48a35',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
