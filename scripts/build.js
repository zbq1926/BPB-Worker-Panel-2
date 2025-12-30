import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ENTRY = join(__dirname, '../src/protocols/websocket/index.ts');
const DIST_PATH = join(__dirname, '../dist/websocket');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

const success = `${green}✔${reset}`;
const failure = `${red}✗${reset}`;

async function buildWebSocketModule() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    write: false,

    sourcemap: true,
    treeShaking: true,

    loader: {
      '.ts': 'ts',
    },

    // 如果 websocket 里引用了 worker / cf 特有模块
    external: [
      'cloudflare:sockets',
    ],
  });

  mkdirSync(DIST_PATH, { recursive: true });

  const outputCode = result.outputFiles[0].text;

  const banner =
    `// WebSocket protocol bundle\n` +
    `// Build: ${new Date().toISOString()}\n` +
    `// @ts-nocheck\n\n`;

  writeFileSync(
    join(DIST_PATH, 'websocket.js'),
    banner + outputCode,
    'utf8'
  );

  console.log(`${success} WebSocket module built successfully`);
  console.log(`→ dist/websocket/websocket.js`);
}

buildWebSocketModule().catch((err) => {
  console.error(`${failure} Build failed:`, err);
  process.exit(1);
});
