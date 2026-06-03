// Builds three bundles with esbuild:
//   1. Extension host   -> dist/extension.js  (Node/CJS, 'vscode' external)
//   2. Sidebar React UI -> dist/webview.js    (browser/IIFE, React bundled)
//   3. Canvas React UI  -> dist/canvas.js     (browser/IIFE, React bundled)
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview-ui/src/main.tsx'],
  bundle: true,
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  // Use the automatic JSX runtime so JSX compiles to jsx-runtime imports
  // instead of React.createElement(...). The .tsx sources don't import React
  // (matching tsconfig.webview.json's "jsx": "react-jsx"); without this,
  // esbuild's default classic transform throws "React is not defined".
  jsx: 'automatic',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
};

/** @type {import('esbuild').BuildOptions} */
const canvasConfig = {
  ...webviewConfig,
  entryPoints: ['webview-ui/src/canvas/main.tsx'],
  outfile: 'dist/canvas.js',
};

async function run() {
  if (watch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    const canvasCtx = await esbuild.context(canvasConfig);
    await Promise.all([extCtx.watch(), webCtx.watch(), canvasCtx.watch()]);
    console.log('[esbuild] watching...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
      esbuild.build(canvasConfig),
    ]);
    console.log('[esbuild] build complete');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
