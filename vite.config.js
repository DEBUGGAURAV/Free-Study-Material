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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-pdflib': ['pdf-lib'],
          'vendor-yjs': ['yjs', 'y-webrtc'],
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
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
      },
    },
  },
})
