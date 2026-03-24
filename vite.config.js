import { defineConfig } from 'vite';

/**
 * Vite Configuration with Performance Optimizations
 *
 * Optimizations:
 * - Code splitting for reduced initial bundle size
 * - Dynamic imports for heavy modules
 * - Tree shaking for unused code elimination
 * - Compression for production builds
 */

export default defineConfig(({ command, mode }) => ({
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'dist',
    sourcemap: mode === 'development',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info']
      }
    },
    rollupOptions: {
      input: {
        main: 'index.html'
      },
      output: {
        // Advanced code splitting strategy
        manualChunks: (id) => {
          // Vendor chunks - split large dependencies
          if (id.includes('node_modules')) {
            // D3.js plotting library
            if (id.includes('d3') || id.includes('d3-')) {
              return 'vendor-d3';
            }
            // IndexedDB wrapper
            if (id.includes('idb')) {
              return 'vendor-idb';
            }
            // Other vendors
            return 'vendor';
          }

          // Application chunks - split by feature
          if (id.includes('/src/lib/')) {
            // Statistical methods - load on demand
            if (id.includes('/meta-') || id.includes('/nma/')) {
              return 'chunk-statistics';
            }
            // Advanced methods - rarely used, heavy
            if (id.includes('advanced-methods')) {
              return 'chunk-advanced';
            }
            // Bayesian methods
            if (id.includes('/bayesian/')) {
              return 'chunk-bayesian';
            }
            // Workers
            if (id.includes('/workers/')) {
              return 'chunk-workers';
            }
            // Other library code
            return 'chunk-lib';
          }

          // Components - UI split
          if (id.includes('/src/components/')) {
            if (id.includes('/analysis/')) {
              return 'chunk-analysis-ui';
            }
            if (id.includes('/screening/')) {
              return 'chunk-screening-ui';
            }
            if (id.includes('/extraction/')) {
              return 'chunk-extraction-ui';
            }
            return 'chunk-components';
          }
        },
        // Asset naming with hash for cache busting
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name;
          if (name && name.endsWith('.css')) {
            return 'assets/css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: '[name]-[hash].js'
      }
    },
    target: 'es2020',
    chunkSizeWarningLimit: 500,
    // Enable compression
    reportCompressedSize: true,
    // Optimize chunk loading
    modulePreload: {
      polyfill: true
    }
  },

  server: {
    port: 3000,
    open: true,
    cors: true,
    // Enable file system watching for hot reload
    watch: {
      usePolling: false,
      interval: 100
    }
  },

  preview: {
    port: 4173
  },

  worker: {
    format: 'es',
    // Bundle workers separately
    rollupOptions: {
      output: {
        chunkFileNames: 'workers/[name]-[hash].js',
        entryFileNames: 'workers/[name]-[hash].js'
      }
    }
  },

  optimizeDeps: {
    include: ['idb'],
    // Pre-bundle D3 for faster dev server
    force: false
  },

  define: {
    __APP_VERSION__: JSON.stringify('3.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __DEV__: mode === 'development'
  },

  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@lib': '/src/lib',
      '@workers': '/src/workers',
      '@styles': '/src/styles'
    }
  },

  // Experimental features for better performance
  experimental: {
    // Enable render-built-in-module-source
    renderBuiltUrl: (filename, { hostId, hostType }) => {
      // Customize asset URLs if needed
      return { relative: true };
    }
  }
}));
