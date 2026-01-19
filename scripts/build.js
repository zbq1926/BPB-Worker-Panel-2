import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { globSync } from 'glob';
import { minify as jsMinify } from 'terser';
import { minify as htmlMinify } from 'html-minifier';
import JSZip from 'jszip';
import pkg from '../package.json' with { type: 'json' };
import { gzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ASSET_PATH = join(__dirname, '../src/assets');
const DIST_PATH = join(__dirname, '../dist');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

const success = `${green}✔${reset}`;
const failure = `${red}✗${reset}`;

const version = pkg.version;

/* ===============================
   HTML 资源处理
================================ */

async function processHtmlPages() {
  const indexFiles = globSync('**/index.html', { cwd: ASSET_PATH });
  const result = {};

  for (const relativeIndexPath of indexFiles) {
    const dir = pathDirname(relativeIndexPath);
    const base = (file) => join(ASSET_PATH, dir, file);

    const indexHtml = readFileSync(base('index.html'), 'utf8');
    let finalHtml = indexHtml.replaceAll('__VERSION__', version);

    if (dir !== 'error') {
      const styleCode = readFileSync(base('style.css'), 'utf8');
      const scriptCode = readFileSync(base('script.js'), 'utf8');

      const minifiedScript = await jsMinify(scriptCode, {
        mangle: false,
        compress: false,
      });

      finalHtml = finalHtml
        .replaceAll('__STYLE__', `<style>${styleCode}</style>`)
        .replaceAll('__SCRIPT__', minifiedScript.code);
    }

    const minifiedHtml = htmlMinify(finalHtml, {
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      minifyCSS: true,
    });

    const compressed = gzipSync(minifiedHtml);
    result[dir] = JSON.stringify(compressed.toString('base64'));
  }

  console.log(`${success} Assets bundled successfully`);
  return result;
}

/* ===============================
   Worker 构建
================================ */

async function buildWorker() {
  const htmls = await processHtmlPages();

  const faviconBuffer = readFileSync('./src/assets/favicon.ico');
  const faviconBase64 = faviconBuffer.toString('base64');

  const result = await build({
    entryPoints: [join(__dirname, '../src/worker.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
    target: 'esnext',
    sourcemap: true,
    loader: {
      '.ts': 'ts',
    },
    external: ['cloudflare:sockets'],
    define: {
      __PANEL_HTML_CONTENT__: htmls['panel'] ?? '""',
      __LOGIN_HTML_CONTENT__: htmls['login'] ?? '""',
      __ERROR_HTML_CONTENT__: htmls['error'] ?? '""',
      __SECRETS_HTML_CONTENT__: htmls['secrets'] ?? '""',
      __ICON__: JSON.stringify(faviconBase64),
      __VERSION__: JSON.stringify(version),
    },
  });

  console.log(`${success} Worker bundled successfully`);

  const finalCode = result.outputFiles[0].text;

  const buildTimestamp = new Date().toISOString();
  const workerCode =
    `// Build: ${buildTimestamp}\n` +
    `// @ts-nocheck\n` +
    finalCode;

  mkdirSync(DIST_PATH, { recursive: true });
  writeFileSync(join(DIST_PATH, 'worker.js'), workerCode, 'utf8');

  const zip = new JSZip();
  zip.file('_worker.js', workerCode);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  writeFileSync(join(DIST_PATH, 'worker.zip'), zipBuffer);

  console.log(`${success} Done!`);
}

/* ===============================
   执行
================================ */

buildWorker().catch((err) => {
  console.error(`${failure} Build failed:`, err);
  process.exit(1);
});
