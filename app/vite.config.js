import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react-phone-number-input/')) return 'phone-input';
          if (id.includes('/node_modules/libphonenumber-js/')) return 'phone-number-metadata';
        },
      },
    },
  },
});