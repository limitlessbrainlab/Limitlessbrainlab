import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { compression } from 'vite-plugin-compression2'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Gzip + Brotli pre-compressed assets — Render serves .br/.gz automatically
    compression({ algorithm: 'brotliCompress', exclude: /\.(png|jpg|jpeg|webp|gif|svg)$/ }),
    compression({ algorithm: 'gzip', exclude: /\.(png|jpg|jpeg|webp|gif|svg)$/ }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Strip console.log/warn/error from production bundle
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — cached across all pages
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase — large SDK, changes rarely
          'vendor-supabase': ['@supabase/supabase-js'],
          // Stripe — only needed on payment pages
          'vendor-stripe': ['@stripe/stripe-js'],
          // UI libraries
          'vendor-ui': ['lucide-react', 'react-hot-toast'],
          // Data fetching
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
  },
})
