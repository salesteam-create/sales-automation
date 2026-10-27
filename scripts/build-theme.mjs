// Builds src/views/theme.ts from the design system.
//
//   design-system/tokens.json      the tokens, compiled here into custom properties
//   design-system/bundle.css       the component stylesheet
//   design-system/app-layout.css   layout classes that only this app needs
//
// Run `npm run build:theme` after changing any of them. The design system is also
// published as an artifact; these files are the copy the build uses.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const t = JSON.parse(read('design-system/tokens.json'));
const themes = t.color.themes.map((x) => x.id);
const valueFor = (v, theme) => (typeof v === 'string' ? v : (v[theme] ?? v[themes[0]]));
const perTheme = [...t.color.tokens, ...(t.shadow?.tokens ?? [])];

let css = `:root, [data-theme="${themes[0]}"] {\n`;
for (const tk of perTheme) css += `  --${tk.name}: ${valueFor(tk.value, themes[0])};\n`;
css += '}\n';
for (const theme of themes.slice(1)) {
  css += `[data-theme="${theme}"] {\n`;
  for (const tk of perTheme) css += `  --${tk.name}: ${valueFor(tk.value, theme)};\n`;
  css += '}\n';
}
css += ':root {\n';
for (const family of ['spacing', 'radius']) for (const tk of t[family]?.tokens ?? []) css += `  --${tk.name}: ${tk.value};\n`;
for (const [key, stack] of Object.entries(t.type.families)) css += `  --font-${key}: ${stack};\n`;
css += '}\n';

const out = [
  '/* Generated from the Agency Tracker design system: tokens.json + components/bundle.css. */',
  '/* Edit the design system, not this file. */',
  css,
  read('design-system/bundle.css'),
  read('design-system/app-layout.css'),
].join('\n');

// The stylesheet goes into a template literal, so neither may appear in it.
for (const hazard of ['`', '${']) {
  if (out.includes(hazard)) throw new Error(`The stylesheet contains ${hazard}, which would break the template literal.`);
}

const version = createHash('sha256').update(out).digest('hex').slice(0, 10);
writeFileSync(
  join(root, 'src/views/theme.ts'),
  '// The application stylesheet, generated from the Agency Tracker design system\n' +
    '// (design-system/). Do not edit by hand: run `npm run build:theme`.\n' +
    '// Served at /app.css so it is cached once rather than inlined on every page.\n\n' +
    `export const CSS_VERSION = '${version}';\n\nexport const CSS = String.raw\`\n${out}\`;\n`,
);
console.log(`src/views/theme.ts written, ${out.length} bytes of CSS, version ${version}`);
