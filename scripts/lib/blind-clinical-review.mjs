/** Offline evaluation only. A completed paperwork check is never clinical validation. */
import { createHash, createHmac } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = value => JSON.stringify(value, (_key,item) => {
  if (typeof item === 'number' && !Number.isFinite(item)) throw Error('Non-finite evidence must not be serialized as missing data');
  return item;
}, 2) + '\n';
export const ID = /^ECG-[a-f0-9]{16}$/;
export const HASH = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k)))
    fail(`Invalid ${label}: missing or unexpected fields`);
  return value;
}
const text = value => typeof value === 'string' && value.trim().length > 0;

export function validateProtocol(p) {
  object(p, ['kind','schemaVersion','scope','synthetic','external','review'], 'protocol');
  if (p.kind !== 'ecg-blind-phenotype-protocol' || p.schemaVersion !== 1 ||
      p.scope !== 'development-phenotype-review-not-clinical-validation') fail('Invalid protocol scope');
  if (!Array.isArray(p.synthetic) || p.synthetic.length < 1 || p.synthetic.length > 63) fail('Invalid synthetic selection');
  const presets = new Set();
  for (const row of p.synthetic) {
    object(row, ['preset','variants'], 'synthetic selection');
    if (typeof row.preset !== 'string' || !/^[a-z0-9_]+$/.test(row.preset) || presets.has(row.preset)) fail('Invalid or duplicate preset');
    presets.add(row.preset);
    if (!Array.isArray(row.variants) || row.variants.length < 1 || row.variants.length > 10 ||
        new Set(row.variants).size !== row.variants.length || row.variants.some(x =>
          x !== 'preset' && (!Number.isSafeInteger(x) || x < 1 || x > 2147483647))) fail('Invalid or duplicate seed variant');
  }
  object(p.external, ['dataset','role','records'], 'external selection');
  if (p.external.dataset !== 'LUDB-1.0.1' || p.external.role !== 'exposed-regression-controls-not-holdout' ||
      !Array.isArray(p.external.records) || new Set(p.external.records).size !== p.external.records.length ||
      p.external.records.some(x => !['1','2','3','4','101','102','103','104'].includes(x)))
    fail('External records must remain exposed LUDB regression controls, never a new holdout');
  object(p.review, ['independentReaders','adjudication','maxUnresolvedMajorErrors'], 'review policy');
  if (p.review.independentReaders !== 2 || p.review.adjudication !== 'all-records-after-blind-readings' ||
      p.review.maxUnresolvedMajorErrors !== 0) fail('Invalid frozen review policy');
  return p;
}

/** The secret must stay with the coordinator. IDs and order expose no seed/preset. */
export function blindRoster(items, secret) {
  if (!Buffer.isBuffer(secret) || secret.length !== 32) fail('A 32-byte private blinding key is required');
  const seen = new Set();
  return items.map(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) fail('Duplicate source selection');
    seen.add(key);
    return { id: `ECG-${createHmac('sha256', secret).update(key).digest('hex').slice(0, 16)}`, source: item };
  }).sort((a,b) => a.id.localeCompare(b.id));
}

export function reviewTemplate(manifest, stage = 'blind-reading') {
  return {
    kind: 'ecg-phenotype-human-review', schemaVersion: 1, clinicalValidation: false,
    packageId: manifest.packageId, protocolSha256: manifest.protocolSha256,
    stage,
    reviewer: { id: '', name: '', credential: '', origin: 'human', independentOfAuthors: false,
      readWithoutKeys: stage === 'blind-reading' ? false : null, completedAt: null },
    ...(stage === 'adjudication' ? { readingSha256: [] } : {}),
    rows: manifest.cases.map(({id}) => stage === 'blind-reading'
      ? { id, assessment: null, majorTeachingError: null, readable: null, observations: '' }
      : { id, decision: null, expectedPhenotypeChecked: false, reason: '' }),
  };
}

function parseReview(review, manifest, stage) {
  object(review, ['kind','schemaVersion','clinicalValidation','packageId','protocolSha256','stage','reviewer','rows',
    ...(stage === 'adjudication' ? ['readingSha256'] : [])], 'human review');
  if (review.kind !== 'ecg-phenotype-human-review' || review.schemaVersion !== 1 || review.clinicalValidation !== false ||
      review.packageId !== manifest.packageId || review.protocolSha256 !== manifest.protocolSha256 || review.stage !== stage)
    fail('Review identity/scope mismatch: no clinical self-certification is accepted');
  const r = object(review.reviewer, ['id','name','credential','origin','independentOfAuthors','readWithoutKeys','completedAt'], 'reviewer');
  if (r.origin !== 'human' || typeof r.independentOfAuthors !== 'boolean' ||
      (stage === 'blind-reading' ? typeof r.readWithoutKeys !== 'boolean' : r.readWithoutKeys !== null))
    fail('Only declared independent human readings are accepted; automation cannot certify itself');
  for (const field of ['id','name','credential']) if (typeof r[field] !== 'string') fail('Invalid reviewer field');
  if (r.completedAt !== null && (typeof r.completedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(r.completedAt) || !Number.isFinite(Date.parse(r.completedAt))))
    fail('Invalid human completion time');
  const issues = [];
  if (![r.id,r.name,r.credential].every(text) || !r.independentOfAuthors || r.completedAt === null ||
      (stage === 'blind-reading' && !r.readWithoutKeys)) issues.push('Missing human identity, independence or completion declaration');
  if (!Array.isArray(review.rows) || review.rows.length > manifest.cases.length) fail('Invalid review rows');
  const allowed = new Set(manifest.cases.map(c => c.id)), seen = new Set();
  for (const row of review.rows) {
    const fields = stage === 'blind-reading' ? ['id','assessment','majorTeachingError','readable','observations']
      : ['id','decision','expectedPhenotypeChecked','reason'];
    object(row, fields, 'case judgement');
    if (!allowed.has(row.id) || seen.has(row.id)) fail('Unknown or duplicate blinded case');
    seen.add(row.id);
    if (stage === 'blind-reading') {
      if (![null,'plausible','implausible','indeterminate'].includes(row.assessment) ||
          ![null,true,false].includes(row.majorTeachingError) || ![null,true,false].includes(row.readable) ||
          typeof row.observations !== 'string') fail('Invalid reading judgement');
      if (row.assessment === null || row.majorTeachingError === null || row.readable === null || row.observations.trim().length < 10)
        issues.push(`Incomplete blind reading: ${row.id}`);
    } else {
      if (![null,'accepted','major-error','unresolved'].includes(row.decision) ||
          typeof row.expectedPhenotypeChecked !== 'boolean' || typeof row.reason !== 'string') fail('Invalid adjudication');
      if (row.decision === null || !row.expectedPhenotypeChecked || row.reason.trim().length < 20)
        issues.push(`Incomplete phenotype adjudication: ${row.id}`);
    }
  }
  for (const id of allowed) if (!seen.has(id)) issues.push(`Missing case judgement: ${id}`);
  if (stage === 'adjudication' && (!Array.isArray(review.readingSha256) || review.readingSha256.length !== 2 ||
      review.readingSha256.some(x => !HASH.test(x)))) issues.push('Adjudication must bind both exact reading files');
  return { review, complete: issues.length === 0, issues };
}

/** Human identities are declarations, not authenticated credentials. No return
 * value is called "pass" or sets clinicalValidation=true. */
export function assessReviews(manifest, readingInputs = [], adjudicationInput = null) {
  if (readingInputs.length > 2) fail('Exactly two independent readers are required');
  for (const input of [...readingInputs,...(adjudicationInput ? [adjudicationInput] : [])])
    if (json(JSON.parse(Buffer.from(input.bytes).toString('utf8'))) !== json(input.value)) fail('Parsed review differs from the bound file bytes');
  const readings = readingInputs.map(({value,bytes}) => ({ ...parseReview(value, manifest, 'blind-reading'), hash: sha256(bytes) }));
  const ids = readings.map(x => x.review.reviewer.id.trim().toLowerCase()).filter(Boolean);
  const names = readings.map(x => x.review.reviewer.name.trim().toLowerCase()).filter(Boolean);
  if (new Set(ids).size !== ids.length || new Set(names).size !== names.length) fail('The two readers must be different people');
  const issues = readings.flatMap(x => x.issues);
  if (readings.length !== 2) issues.push('Two independent human readings are still required');
  const adjudication = adjudicationInput ? parseReview(adjudicationInput.value, manifest, 'adjudication') : null;
  if (adjudication) {
    const r = adjudication.review.reviewer;
    if ((text(r.id) && ids.includes(r.id.trim().toLowerCase())) ||
        (text(r.name) && names.includes(r.name.trim().toLowerCase()))) fail('Adjudication needs a third independent declared reviewer');
    issues.push(...adjudication.issues);
    if (adjudication.complete && (readings.length !== 2 ||
        JSON.stringify([...adjudication.review.readingSha256].sort()) !== JSON.stringify(readings.map(x => x.hash).sort())))
      fail('Adjudication does not bind these exact two reading files');
    if (adjudication.complete && readings.every(x=>x.complete) && Date.parse(r.completedAt) <
        Math.max(...readings.map(x=>Date.parse(x.review.reviewer.completedAt))))
      fail('Adjudication must follow both completed blind readings');
  } else issues.push('Phenotype adjudication against the separate key is still required');
  const rows = adjudication?.review.rows ?? [];
  const majorErrors = rows.filter(x => x.decision === 'major-error').map(x => x.id);
  const unresolved = rows.filter(x => x.decision === 'unresolved').map(x => x.id);
  const disagreements = [];
  if (readings.length === 2) {
    const byId = new Map(readings[1].review.rows.map(r => [r.id,r]));
    for (const a of readings[0].review.rows) {
      const b = byId.get(a.id);
      if (b && [a.assessment,a.majorTeachingError,a.readable].some((x,i) => x !== [b.assessment,b.majorTeachingError,b.readable][i]))
        disagreements.push(a.id);
    }
  }
  return {
    reviewState: issues.length ? 'pending-human-review' : majorErrors.length || unresolved.length
      ? 'needs-remediation' : 'review-records-complete-not-clinical-validation',
    clinicalValidation: false, authenticatedHumanCredentials: false,
    readersComplete: readings.filter(x => x.complete).length,
    adjudicationComplete: !!adjudication?.complete, totalCases: manifest.cases.length,
    majorErrors, unresolved, disagreements, issues,
    limitation: 'Checks declared human paperwork and packet integrity only; does not authenticate people or establish clinical validity, representativeness or diagnostic accuracy.',
  };
}

/** Canvas adapter for the existing renderPaper drawing commands. It never reads
 * source metadata; header replacement hides synthetic/external identity alike. */
export function paperSVG(renderPaper, signal, c, id) {
  if (!ID.test(id)) fail('Invalid blinded case ID');
  const elements = [], definitions = [], stack = [];
  let path = [], clip = null;
  const esc = x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const n = value => { if (!Number.isFinite(value)) fail('Non-finite SVG coordinate'); return +value.toFixed(6); };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0.29, font: '', lineJoin: 'round', lineCap: 'round', dash: [],
    setTransform() {}, beginPath() { path = []; },
    moveTo(x,y) { path.push(`M${n(x)} ${n(y)}`); }, lineTo(x,y) { path.push(`L${n(x)} ${n(y)}`); },
    rect(x,y,w,h) { path.push(`M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`); },
    fillRect(x,y,w,h) { elements.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${esc(this.fillStyle)}"/>`); },
    stroke() { elements.push(`<path d="${path.join('')}" fill="none" stroke="${esc(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}" stroke-linejoin="round" stroke-linecap="round"${this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : ''}${clip ? ` clip-path="url(#${clip})"` : ''}/>`); },
    clip() { clip = `clip-${definitions.length}`; definitions.push(`<clipPath id="${clip}"><path d="${path.join('')}"/></clipPath>`); },
    save() { stack.push({ fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,font:this.font,dash:[...this.dash],clip }); },
    restore() { const s = stack.pop(); if (!s) fail('Unbalanced SVG context'); const {clip:savedClip,...state}=s; clip=savedClip; Object.assign(this,state); },
    setLineDash(values) { this.dash=[...values]; },
    fillText(value,x,y) {
      let label = value;
      if (String(label).startsWith('ECG LAB  /  ')) label = id;
      if (String(label).includes('señal sintética')) label = `${c.view.speed} mm/s · ${c.view.gain} mm/mV · origen oculto para revisión`;
      const size = Number(this.font.match(/([\d.]+)px/)?.[1]);
      if (!Number.isFinite(size)) fail('Unsupported SVG font');
      elements.push(`<text x="${n(x)}" y="${n(y)}" font-family="monospace" font-size="${size}" fill="${esc(this.fillStyle)}">${esc(label)}</text>`);
    },
  };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const layout = renderPaper(canvas, signal, c, 1200, { pxPerMm: 4, ratio: 1, hideName: true, annotations: false });
  if (stack.length) fail('Unbalanced SVG drawing');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(layout.widthMm)}mm" height="${n(layout.heightMm)}mm" viewBox="0 0 ${n(layout.widthMm)} ${n(layout.heightMm)}" role="img" aria-label="${id}"><defs>${definitions.join('')}</defs>${elements.join('')}</svg>\n`;
}
