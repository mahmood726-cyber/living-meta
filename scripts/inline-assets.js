/**
 * Post-build script to create single-file HTML
 * Inlines CSS and JS into HTML
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist-single');
const OUTPUT_FILE = join(DIST_DIR, 'index.html');

console.log('Creating single-file HTML...');

// Read the built HTML
let html = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');

// Get all JS files
const jsFiles = readdirSync(DIST_DIR)
  .filter(f => f.endsWith('.js') && f !== 'index.html')
  .sort();

// Get all CSS files
const cssFiles = readdirSync(DIST_DIR)
  .filter(f => f.endsWith('.css'))
  .sort();

// Inline CSS
for (const cssFile of cssFiles) {
  const cssContent = readFileSync(join(DIST_DIR, cssFile), 'utf-8');
  const styleTag = `<style>${cssContent}</style>`;

  // Replace link tags with inline styles
  html = html.replace(
    new RegExp(`<link[^>]*href=["'].*?${cssFile}["'][^>]*>`),
    styleTag
  );
}

// Inline JS
for (const jsFile of jsFiles) {
  const jsContent = readFileSync(join(DIST_DIR, jsFile), 'utf-8');
  const scriptTag = `<script>${jsContent}</script>`;

  // Replace script src tags with inline scripts
  html = html.replace(
    new RegExp(`<script[^>]*src=["'].*?${jsFile}["'][^>]*>.*?</script>`, 's'),
    scriptTag
  );
}

// Clean up any remaining external references
// Remove type="module" since inline scripts don't need it
html = html.replace(/<script type="module">/g, '<script>');

// Write the final single-file HTML
writeFileSync(OUTPUT_FILE, html);

// Get file size
const size = statSync(OUTPUT_FILE).size;

console.log(`✅ Single-file HTML created!`);
console.log(`📄 ${OUTPUT_FILE}`);
console.log(`📊 Size: ${(size / 1024).toFixed(2)} KB (${(size / 1024 / 1024).toFixed(2)} MB)`);
