/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs:    ['0.8125rem', { lineHeight: '1.125rem' }],
        sm:    ['0.9375rem', { lineHeight: '1.375rem' }],
        base:  ['1.0625rem', { lineHeight: '1.625rem' }],
        lg:    ['1.1875rem', { lineHeight: '1.75rem' }],
        xl:    ['1.375rem',  { lineHeight: '1.875rem' }],
        '2xl': ['1.625rem',  { lineHeight: '2rem' }],
        '3xl': ['2rem',      { lineHeight: '2.375rem' }],
        '4xl': ['2.5rem',    { lineHeight: '2.75rem' }],
        '5xl': ['3.25rem',   { lineHeight: '3.5rem' }],
        '6xl': ['4rem',      { lineHeight: '4.25rem' }],
      },
    },
  },
  plugins: [],
};
