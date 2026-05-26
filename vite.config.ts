import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    proxy: { '/api': { target: 'http://localhost:4101', changeOrigin: true } },
  },
});
