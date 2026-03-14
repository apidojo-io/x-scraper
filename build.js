import { build } from 'esbuild';

const shared = {
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['apify-client'],
};

await Promise.all([
  build({ ...shared, format: 'esm', outfile: 'dist/index.mjs' }),
  build({ ...shared, format: 'cjs', outfile: 'dist/index.cjs' }),
]);

console.log('Build complete: dist/index.mjs + dist/index.cjs');
