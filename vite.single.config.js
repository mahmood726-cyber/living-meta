import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite configuration for single-file build
 * Creates a bundle with everything inline
 */
export default defineConfig({
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'dist-single',
    emptyOutDir: true,

    // Generate a single bundle
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',

        // Manual chunks to control splitting
        manualChunks: undefined,

        // Don't split into chunks (single file)
        inlineDynamicImports: true
      }
    },

    // Minify for smaller output
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
        pure_funcs: []
      }
    },

    // CSS code splitting (we want it inlined)
    cssCodeSplit: false,

    target: 'es2020',
    reportCompressedSize: false
  },

  // Disable source maps for single file
  sourcemap: false,

  // Disable optimizations that create separate files
  optimizeDeps: {
    include: ['idb']
  },

  plugins: []
});
