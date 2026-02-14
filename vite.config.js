import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, join } from 'path';
import { copyFileSync, existsSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        const src = resolve(__dirname, 'manifest.json');
        const dest = join(__dirname, 'dist', 'manifest.json');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'content-script': resolve(__dirname, 'src/content-script.jsx'),
        'background': resolve(__dirname, 'src/background.js'),
        'injected-script': resolve(__dirname, 'src/injected-script.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) =>
          assetInfo.name && assetInfo.name.endsWith('.css')
            ? 'assets/content.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
    sourcemap: true,
    minify: true,
    target: 'esnext',
  },
});
