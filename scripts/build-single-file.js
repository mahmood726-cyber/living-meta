/**
 * Single-File Build Script
 * Consolidates all CSS, JavaScript, and Workers into a single HTML file
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SRC_DIR = join(ROOT_DIR, 'src');
const DIST_DIR = join(ROOT_DIR, 'dist-single');
const OUTPUT_FILE = join(DIST_DIR, 'living-meta-single.html');

// Ensure output directory exists
if (!existsSync(DIST_DIR)) {
  mkdirSync(DIST_DIR, { recursive: true });
}

/**
 * Recursively get all JS files in a directory
 */
function getJSFiles(dir, baseDir = dir) {
  const files = [];
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and test directories
      if (item !== 'node_modules' && item !== 'tests' && item !== '__tests__') {
        files.push(...getJSFiles(fullPath, baseDir));
      }
    } else if (item.endsWith('.js')) {
      const relativePath = fullPath.replace(baseDir + '/', '').replace(/\\/g, '/');
      files.push({ path: fullPath, relative: relativePath });
    }
  }

  return files;
}

/**
 * Process Tailwind CSS to inline styles
 */
function buildCSS() {
  console.log('Building CSS...');

  // Use Tailwind CLI to build CSS
  const tailwindInput = join(SRC_DIR, 'styles', 'main.css');
  const tailwindOutput = join(DIST_DIR, 'styles.css');

  // Create a temporary Tailwind config
  const tailwindConfig = {
    content: [
      join(SRC_DIR, '**', '*.js'),
      join(SRC_DIR, '**', '*.html'),
      join(ROOT_DIR, 'index.html')
    ],
    theme: {
      extend: {
        colors: {
          primary: {
            50: '#eff6ff',
            100: '#dbeafe',
            200: '#bfdbfe',
            300: '#93c5fd',
            400: '#60a5fa',
            500: '#3b82f6',
            600: '#2563eb',
            700: '#1e40af',
            800: '#1e3a8a',
            900: '#1e3a8a',
          },
          success: {
            50: '#f0fdf4',
            100: '#dcfce7',
            500: '#22c55e',
            600: '#16a34a',
            700: '#15803d',
          },
          warning: {
            50: '#fffbeb',
            100: '#fef3c7',
            500: '#f59e0b',
            600: '#d97706',
            700: '#b45309',
          },
          danger: {
            50: '#fef2f2',
            100: '#fee2e2',
            500: '#ef4444',
            600: '#dc2626',
            700: '#b91c1c',
          }
        }
      }
    },
    plugins: []
  };

  try {
    // Try using npx tailwindcss
    execSync(`npx tailwindcss -i "${tailwindInput}" -o "${tailwindOutput}" --config "${join(DIST_DIR, 'tailwind.config.js')}"`, {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
  } catch (err) {
    // Fallback: read the CSS file directly and replace Tailwind directives with base styles
    console.log('Tailwind CLI not available, using basic CSS...');
    let css = readFileSync(tailwindInput, 'utf-8');

    // Remove Tailwind directives and add base styles
    css = css.replace(/@tailwind\s+\w+;?/g, '');

    // Add essential Tailwind utility classes as base CSS
    const tailwindReset = `
/* Tailwind CSS Base */
*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
::before,::after{--tw-content:''}
html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;-o-tab-size:4;tab-size:4;font-family:Inter,system-ui,sans-serif}
body{margin:0;line-height:inherit}
h1,h2,h3{margin:0;font-weight:600}
h1{font-size:1.875rem;line-height:2.25rem}
h2{font-size:1.5rem;line-height:2rem}
h3{font-size:1.25rem;line-height:1.75rem}

/* Utilities */
.flex{display:flex}
.flex-col{flex-direction:column}
.flex-1{flex:1 1 0%}
.items-center{align-items:center}
.justify-center{justify-content:center}
.justify-between{justify-content:space-between}
.space-x-1>:not([hidden])~:not([hidden]){--tw-space-x-reverse:0;margin-right:calc(0.25rem*var(--tw-space-x-reverse));margin-left:calc(0.25rem*calc(1 - var(--tw-space-x-reverse)))}
.space-x-2>:not([hidden])~:not([hidden]){--tw-space-x-reverse:0;margin-right:calc(0.5rem*var(--tw-space-x-reverse));margin-left:calc(0.5rem*calc(1 - var(--tw-space-x-reverse)))}
.space-x-4>:not([hidden])~:not([hidden]){--tw-space-x-reverse:0;margin-right:calc(1rem*var(--tw-space-x-reverse));margin-left:calc(1rem*calc(1 - var(--tw-space-x-reverse)))}
.space-y-2>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(0.5rem*var(--tw-space-y-reverse));margin-bottom:calc(0.5rem*calc(1 - var(--tw-space-y-reverse)))}
.min-h-screen{min-height:100vh}
.max-w-7xl{max-width:80rem}
.mx-auto{margin-left:auto;margin-right:auto}
.px-4{padding-left:1rem;padding-right:1rem}
.py-4{padding-top:1rem;padding-bottom:1rem}
.py-8{padding-top:2rem;padding-bottom:2rem}
.sticky{position:sticky}
.top-0{top:0}
.z-40{z-index:40}
.z-50{z-index:50}
.hidden{display:none}
.md\\:flex{display:none}
@media(min-width:768px){.md\\:flex{display:flex}}
.text-sm{font-size:0.875rem;line-height:1.25rem}
.text-xl{font-size:1.25rem;line-height:1.75rem}
.font-bold{font-weight:700}
.font-semibold{font-weight:600}
.text-gray-500{--tw-text-opacity:1;color:rgb(107 114 128/var(--tw-text-opacity))}
.text-gray-700{--tw-text-opacity:1;color:rgb(55 65 81/var(--tw-text-opacity))}
.text-gray-900{--tw-text-opacity:1;color:rgb(17 24 39/var(--tw-text-opacity))}
.text-primary-600{--tw-text-opacity:1;color:rgb(37 99 235/var(--tw-text-opacity))}
.bg-white{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity))}
.bg-gray-50{--tw-bg-opacity:1;background-color:rgb(249 250 251/var(--tw-bg-opacity))}
.border{border-width:1px}
.border-b{border-bottom-width:1px}
.border-t{border-top-width:1px}
.border-gray-200{--tw-border-opacity:1;border-color:rgb(229 231 235/var(--tw-border-opacity))}
.rounded-lg{border-radius:0.5rem}
.rounded-xl{border-radius:0.75rem}
.rounded-full{border-radius:9999px}
.shadow-sm{--tw-shadow:0 1px 2px 0 rgb(0 0 0/.05);box-shadow:var(--tw-shadow)}
.w-8{width:2rem}
.h-8{height:2rem}
.h-16{height:4rem}
.h-64{height:16rem}
.p-6{padding:1.5rem}
.mt-auto{margin-top:auto}
.fixed{position:fixed}
.bottom-4{bottom:1rem}
.right-4{right:1rem}
.hover\\:bg-primary-700:hover{--tw-bg-opacity:1;background-color:rgb(29 78 163/var(--tw-bg-opacity))}
.hover\\:underline:hover{text-decoration:underline}
.hover\\:bg-gray-200:hover{--tw-bg-opacity:1;background-color:rgb(229 231 235/var(--tw-bg-opacity))}
.focus\\:outline-none:focus{outline:2px solid transparent;outline-offset:2px}
.focus\\:ring-2:focus{--tw-ring-offset-shadow:var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);--tw-ring-shadow:var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);box-shadow:var(--tw-ring-offset-shadow),var(--tw-ring-shadow)}
.focus\\:ring-primary-500:focus{--tw-ring-opacity:1;--tw-ring-color:rgb(59 130 246/var(--tw-ring-opacity))}
.transition-colors{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s}
.duration-150{transition-duration:.15s}
@keyframes spin{to{transform:rotate(360deg)}}
.animate-spin{animation:spin 1s linear infinite}

/* Button styles */
.btn{display:inline-flex;align-items:center;justify-content:center;padding:0.5rem 1rem;font-size:0.875rem;font-weight:500;border-radius:0.5rem;transition:all .15s}
.btn-primary{background-color:rgb(37 99 235);color:white}
.btn-primary:hover{background-color:rgb(29 78 163)}
`;

    writeFileSync(tailwindOutput, tailwindReset + css);
  }

  const css = readFileSync(tailwindOutput, 'utf-8');
  return css;
}

/**
 * Convert import statements to inline code
 */
function inlineImports(code, jsFiles) {
  // Handle ES module imports
  const importRegex = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"];?\s*/g;
  const importStarRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*/g;
  const importDefaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const exportRegex = /export\s+(const|function|class)\s+(\w+)/g;

  // Collect all modules
  const modules = {};
  const moduleOrder = [];

  // First pass: identify all files and their exports
  for (const file of jsFiles) {
    const content = readFileSync(file.path, 'utf-8');
    const moduleKey = file.relative.replace(/\.js$/, '').replace(/^\//, '');

    // Extract exports
    const exports = [];
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[2]);
    }

    // Check for default export
    if (content.includes('export default')) {
      exports.push('default');
    }

    modules[moduleKey] = {
      content,
      exports,
      processed: false
    };
  }

  // Second pass: inline imports recursively
  function processImports(content, processed = new Set()) {
    let result = content;

    // Process regular imports
    result = result.replace(importRegex, (match, imports, modulePath) => {
      const moduleKey = modulePath.replace(/\.js$/, '').replace(/^\.\//, '').replace(/^\//, '').replace(/\.+?\//g, '');
      const module = modules[moduleKey];

      if (module && !processed.has(moduleKey)) {
        processed.add(moduleKey);
        const moduleContent = processImports(module.content, processed);
        return `/* inlined from ${modulePath} */\n${moduleContent}\n`;
      }

      return match; // Keep import if not found or already processed
    });

    // Remove export statements (they become regular declarations)
    result = result.replace(/export\s+const/g, 'const');
    result = result.replace(/export\s+function/g, 'function');
    result = result.replace(/export\s+class/g, 'class');
    result = result.replace(/export\s*\{([^}]+)\}/g, '/* exports: $1 */');
    result = result.replace(/export\s+default/g, '/* default export */');

    return result;
  }

  return processImports(code);
}

/**
 * Convert Web Workers to inline blob URLs
 */
function inlineWorkers(code) {
  // Find worker creation patterns
  const workerRegex = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

  return code.replace(workerRegex, (match, workerPath) => {
    // Read the worker file
    const fullPath = join(SRC_DIR, workerPath);
    let workerCode = readFileSync(fullPath, 'utf-8');

    // Inline imports in worker code
    const jsFiles = getJSFiles(SRC_DIR);
    workerCode = inlineImports(workerCode, jsFiles);

    // Remove module type from worker (blob can't be module)
    workerCode = workerCode.replace(/<script[^>]*type=['"]module['"][^>]*>/g, '<script>');
    workerCode = workerCode.replace(/export\s+/g, '');

    // Create blob URL
    const blobCode = `
      const workerBlob = new Blob([${JSON.stringify(workerCode)}], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      new Worker(workerUrl)
    `;

    return blobCode;
  });
}

/**
 * Build the complete single-file HTML
 */
function buildSingleFile() {
  console.log('Building single-file HTML...');

  // Build CSS
  const css = buildCSS();

  // Get all JS files
  const jsFiles = getJSFiles(SRC_DIR);
  console.log(`Found ${jsFiles.length} JavaScript files`);

  // Read main HTML
  const htmlPath = join(ROOT_DIR, 'index.html');
  let html = readFileSync(htmlPath, 'utf-8');

  // Read and inline main.js (app.js is the entry point)
  const appPath = join(SRC_DIR, 'app.js');
  let jsCode = readFileSync(appPath, 'utf-8');

  // Inline all imports
  jsCode = inlineImports(jsCode, jsFiles);

  // Inline workers
  jsCode = inlineWorkers(jsCode);

  // Replace external references with inline content
  html = html.replace(/<link[^>]*href=['"]\/[^"'']*main\.css['"][^>]*>/, `<style>${css}</style>`);
  html = html.replace(/<link[^>]*href=['"]https:\/\/fonts\.googleapis\.com[^"'']*['"][^>]*>/g, ''); // Remove Google Fonts for standalone
  html = html.replace(/<script[^>]*src=['"]\/src\/app\.js['"][^>]*><\/script>/, `<script>${jsCode}</script>`);

  // Remove any other external script links
  html = html.replace(/<script[^>]*src=['"]https:\/\//g, '<!-- external script removed: ');

  // Write output
  writeFileSync(OUTPUT_FILE, html);

  console.log(`\n✅ Single-file build complete!`);
  console.log(`📄 Output: ${OUTPUT_FILE}`);
  console.log(`📊 Size: ${(statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

// Run the build
try {
  buildSingleFile();
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
