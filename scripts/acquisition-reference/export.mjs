/** Reproduce a rejected acquisition experiment offline, without changing src. */
import { build, version as esbuildVersion } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { quietAcquisitionPlugin } from '../lib/quiet-acquisition-experiment.mjs';

if (process.argv.length !== 4 || process.argv[2] !== '--output')
  throw Error('Usage: node scripts/acquisition-reference/export.mjs --output OUTSIDE_REPO');
const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
mkdirSync(path.resolve(process.argv[3]), { recursive: true });
const out = realpathSync(path.resolve(process.argv[3]));
const relative = path.relative(root, out);
if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)))
  throw Error('Keep waveforms and generated reports outside the repository');
if (existsSync(path.join(out, 'synthetic-reference-index.json')) || existsSync(path.join(out, 'comparison-engine.mjs')))
  throw Error('Export already exists; preserve it and use a fresh output folder');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const protocolPath = path.join(root, 'benchmarks/acquisition-cleanliness/protocol.json');
const protocol = JSON.parse(readFileSync(protocolPath));
function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listSourceFiles(file) : [file];
  });
}
const relativePath = file => path.relative(root, file).split(path.sep).join('/');
const snapshotFiles = [...listSourceFiles(path.join(root, 'src')),
  path.join(root, 'scripts/lib/quiet-acquisition-experiment.mjs'), fileURLToPath(import.meta.url), protocolPath];
const beforeHashes = Object.fromEntries(snapshotFiles.map(file => [relativePath(file), hash(file)]));
const models = path.join(root, 'src/engine/realistic/models');
const dynamicModels = readdirSync(models).filter(f => f.endsWith('.json')).map(f => path.join(models, f));
dynamicModels.push(path.join(root, 'src/engine/realistic/ischemia/ischemia-model.json'));
let experiment;
const buildResult = await build({ stdin: { contents: `export {synthesize} from './src/engine/signal.ts';
export {fromPreset,presetById} from './src/presets/catalog.ts';
export {registerShapeModel} from './src/engine/realistic/shape-model.ts';
export {registerIschemiaModel} from './src/engine/realistic/ischemia.ts';
export {withNaturalControls} from './src/engine/realistic/natural.ts';
export {LEADS} from './src/engine/lead-registry.ts';`, resolveDir: root, loader: 'ts' },
  absWorkingDir: root, metafile: true, bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, 'comparison-engine.mjs'),
  plugins: [quietAcquisitionPlugin(root, p => { experiment = p; })], logLevel: 'error' });
if (!experiment) throw Error('Offline acquisition plugin did not run');
const dependencyMetafileInputs = Object.keys(buildResult.metafile.inputs).filter(p => p !== '<stdin>').map(p => relativePath(path.resolve(root, p)));
const sources = [...new Set([...dependencyMetafileInputs, ...dynamicModels.map(relativePath),
  'scripts/lib/quiet-acquisition-experiment.mjs', relativePath(fileURLToPath(import.meta.url)), relativePath(protocolPath)])].sort();
const sourceHashes = Object.fromEntries(sources.map(p => {
  if (!beforeHashes[p]) throw Error('Dependency absent from pre-build snapshot: ' + p);
  return [p, beforeHashes[p]];
}));
const e = await import(pathToFileURL(path.join(out, 'comparison-engine.mjs')).href);
for (const f of readdirSync(models)) if (f.endsWith('.json'))
  e.registerShapeModel(f.slice(0, -5), JSON.parse(readFileSync(path.join(models, f))));
e.registerIschemiaModel(JSON.parse(readFileSync(path.join(root, 'src/engine/realistic/ischemia/ischemia-model.json'))));
mkdirSync(path.join(out, 'synthetic'), { recursive: true });
const records = [];
for (const seed of [...protocol.reserveSeeds, 12066]) {
  const base = e.withNaturalControls({ ...e.fromPreset(e.presetById('sinus')), seed, filter: 'off' });
  for (const profile of ['resting-v1', 'quiet-v1', 'ideal']) {
    const c = { ...base, acquisition: profile === 'ideal' ? 'ideal' : 'realistic',
      acquisitionProfile: profile === 'ideal' ? 'quiet-v1' : profile };
    const s = e.synthesize(c, 10), values = Buffer.alloc(s.leads.I.length * e.LEADS.length * 4);
    for (let i = 0; i < s.leads.I.length; i++) for (let l = 0; l < e.LEADS.length; l++)
      values.writeFloatLE(s.leads[e.LEADS[l]][i], (i * e.LEADS.length + l) * 4);
    const file = `synthetic/${seed}-${profile}.f32`;
    writeFileSync(path.join(out, file), values, { flag: 'wx' });
    records.push({ seed, cohort: seed === 12066 ? 'development-default' : 'predeclared-synthetic-reserve',
      profile, file, sha256: hash(path.join(out, file)), fs: s.fs, samples: s.leads.I.length, leads: e.LEADS, case: c });
  }
}
for (const p of sources) if (hash(path.join(root, p)) !== sourceHashes[p]) throw Error('Source changed during export: ' + p);
writeFileSync(path.join(out, 'synthetic-reference-index.json'), JSON.stringify({
  protocolSha256: hash(protocolPath), sourceHashes, dependencyMetafileInputs, dynamicModelInputs: dynamicModels.map(relativePath),
  runtime: { node: process.version, esbuild: esbuildVersion },
  provenanceRevision: 'Post-reproduction provenance-only hardening; numeric algorithm unchanged',
  experiment, candidateAccepted: false,
  filter: 'off at synthesis; common offline diagnostic highpass applied once to real and synthetic for descriptive comparison',
  records }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ records: records.length, reserveSeeds: protocol.reserveSeeds, developmentSeed: 12066 }));
