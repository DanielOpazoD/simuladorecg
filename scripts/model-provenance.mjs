/** Reproducible catalogue evidence; does not need model binaries, patient data or a browser. */
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outfile = path.join(root, '.sites-runtime', 'model-provenance.mjs');
await build({
  stdin: { contents: 'export {presetEvidence,presetEvidenceMarkdown} from "./src/presets/evidence-matrix.ts";', resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
});
const { presetEvidence, presetEvidenceMarkdown } = await import(pathToFileURL(outfile).href);
const files = new Map([
  ['estado-presets.md', presetEvidenceMarkdown()],
  ['estado-presets.json', JSON.stringify(presetEvidence(), null, 2) + '\n'],
]);
for (const [name, expected] of files) {
  const filename = path.join(root, 'docs', name);
  if (process.argv.includes('--check')) {
    if ((await readFile(filename, 'utf8')).replaceAll('\r\n', '\n') !== expected) throw new Error(`${name} no coincide con la configuración efectiva; ejecuta node scripts/model-provenance.mjs`);
  } else await writeFile(filename, expected);
}
const rows = presetEvidence();
console.log(`${process.argv.includes('--check') ? 'Comprobados' : 'Generados'}: ${rows.filter(p => p.estado === 'aproximado').length} patrones aproximados, ${rows.filter(p => p.estado === 'pendiente').length} pendientes; revisión clínica pendiente.`);
