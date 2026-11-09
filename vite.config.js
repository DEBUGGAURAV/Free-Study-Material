import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'prevent-dist-reload',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && (req.url.startsWith('/dist') || req.url.startsWith('/dist/'))) {
            res.writeHead(302, { Location: '/' });
            return res.end();
          }
          next();
        });
      },
    },
  ],
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    minify: 'esbuild',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('pdfjs-dist')) {
              return 'vendor-pdf';
            }
            if (id.includes('pdf-lib')) {
              return 'vendor-pdflib';
            }
            if (id.includes('yjs') || id.includes('y-webrtc')) {
              return 'vendor-yjs';
            }
            if (id.includes('tesseract.js')) {
              return 'vendor-tesseract';
            }
            if (id.includes('minisearch')) {
              return 'vendor-minisearch';
            }
            if (id.includes('qrcode')) {
              return 'vendor-qrcode';
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/dist/**', '**/dist', '**/.git/**', '**/cache/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[Vite Proxy Warning] Backend unreachable on port 5000:', err.message);
            if (res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                message: 'Backend server is offline or unreachable on port 5000. Please ensure `npm start` is running in your terminal.'
              }));
            }
          });
        },
      },
      '/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:5000',
        ws: true,
      },
    },
  },
})
