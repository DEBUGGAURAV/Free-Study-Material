import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hybrid-mpa-spa-router',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || '/';
          const pathname = rawUrl.split('?')[0];
          if (pathname.startsWith('/dist')) {
            res.writeHead(302, { Location: '/' });
            return res.end();
          }
          // Hybrid dev routing: '/' serves static landing (index.html); app routes serve SPA shell (app/index.html)
          if (
            pathname !== '/' &&
            pathname !== '/index.html' &&
            pathname !== '/app/' &&
            pathname !== '/app/index.html' &&
            !pathname.startsWith('/api/') &&
            !pathname.startsWith('/ws') &&
            !pathname.startsWith('/src/') &&
            !pathname.startsWith('/@') &&
            !pathname.startsWith('/node_modules/') &&
            !pathname.startsWith('/assets/') &&
            !/\.[a-zA-Z0-9]+$/.test(pathname)
          ) {
            req.url = '/app/index.html';
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
    chunkSizeWarningLimit: 2500,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app/index.html'),
      },
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
            if (id.includes('katex')) {
              return 'vendor-katex';
            }
            if (id.includes('elkjs')) {
              return 'vendor-elk';
            }
            if (id.includes('cytoscape') || id.includes('cose-bilkent')) {
              return 'vendor-cytoscape';
            }
            if (id.includes('d3')) {
              return 'vendor-d3';
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
