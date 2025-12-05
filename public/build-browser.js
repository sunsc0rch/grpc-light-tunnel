import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

// Собираем все в один файл
await build({
  entryPoints: ['public/web-client.js'],
  bundle: true,
  format: 'iife', // Immediately Invoked Function Expression
  globalName: 'StealthTunnel',
  outfile: 'public/bundle.js',
  external: [], // все зависимости включаем в bundle
  minify: true
});

console.log('✅ Bundle created: public/bundle.js');
