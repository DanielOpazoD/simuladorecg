/** A conservative membership ledger. Selection policies never stand in for executed manifests. */
export const METRICS = ['withinLeadRatio', 'timing', 'absoluteAmplitude', 'crossLeadVoltage'];

const id = (value) => (typeof value === 'string' && value.trim()) ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ? String(value).trim() : null;
const key = (...parts) => JSON.stringify(parts);
const requireValue = (condition, message) => { if (!condition) throw new TypeError(message); };

export function metricEligibility(units, metric) {
  requireValue(METRICS.includes(metric), `Unknown metric: ${metric}`);
  if (!units || !Array.isArray(units.allowedMetrics)) return { eligible: false, reason: 'units-unresolved' };
  return units.allowedMetrics.includes(metric)
    ? { eligible: true, reason: units.reason ?? 'source-specific-evidence' }
    : { eligible: false, reason: units.reason ?? 'metric-not-supported' };
}

export function auditEvidenceLedger(inventory) {
  requireValue(inventory?.schemaVersion === 1 && Array.isArray(inventory.sources), 'Expected schemaVersion 1 and sources array');
  requireValue(typeof inventory.coverageComplete === 'boolean', 'coverageComplete must be explicit');
  if (inventory.requiredMetrics !== undefined) requireValue(Array.isArray(inventory.requiredMetrics) && inventory.requiredMetrics.length > 0 && inventory.requiredMetrics.every(m => METRICS.includes(m)), 'requiredMetrics must be a nonempty array of known metrics');
  const issues = [], patients = new Map(), records = new Map(), sourceIds = new Set(), sources = [];
  for (const source of inventory.sources) {
    requireValue(source && id(source.id) && !sourceIds.has(source.id), 'Each source needs a unique id');
    sourceIds.add(source.id);
    requireValue(id(source.dataset) && id(source.version), `Missing dataset/version: ${source.id}`);
    requireValue(['exposed', 'candidate'].includes(source.role), `Invalid role: ${source.id}`);
    requireValue(['observed', 'policy-only'].includes(source.identityEvidence), `Invalid identity evidence: ${source.id}`);
    requireValue(typeof source.membershipComplete === 'boolean' && Array.isArray(source.records), `Invalid membership: ${source.id}`);
    requireValue(source.expectedRecords === undefined || Number.isSafeInteger(source.expectedRecords) && source.expectedRecords > 0, `Invalid expectedRecords: ${source.id}`);
    if (source.units) requireValue(Array.isArray(source.units.allowedMetrics) && source.units.allowedMetrics.every(m => METRICS.includes(m)), `Invalid units: ${source.id}`);
    const ownPatients = new Set(), ownRecords = new Set();
    let unresolvedRecords = 0;
    for (const row of source.records) {
      requireValue(row && typeof row === 'object' && !Array.isArray(row) && id(row.recordId), `Invalid record: ${source.id}`);
      const recordId = id(row.recordId), patientId = id(row.patientId);
      requireValue(row.patientId == null || patientId !== null, `Invalid patient ID: ${source.id}/${recordId}`);
      const recordKey = key(source.dataset, source.version, recordId);
      ownRecords.add(recordKey);
      if (row.fold != null) requireValue(Number.isInteger(row.fold) && row.fold >= 1 && row.fold <= 10, `Invalid fold: ${source.id}/${recordId}`);
      if (source.requireFold && row.fold == null) issues.push({ code: 'missing-fold', source: source.id, recordId });
      if (!patientId || source.identityEvidence !== 'observed') {
        unresolvedRecords++;
        continue;
      }
      // dataset is the canonical origin (PTB-XL+ derivatives use PTB-XL), not a vendor label.
      const patientKey = key(source.dataset, patientId);
      ownPatients.add(patientKey);
      if (records.has(recordKey) && records.get(recordKey) !== patientKey) issues.push({ code: 'record-patient-conflict', source: source.id, recordId });
      else records.set(recordKey, patientKey);
      const patient = patients.get(patientKey) ?? { key: patientKey, dataset: source.dataset, patientId, versions: new Set(), records: new Set(), sources: new Set(), roles: new Set(), folds: new Set() };
      patient.records.add(recordId); patient.sources.add(source.id); patient.roles.add(source.role);
      patient.versions.add(source.version);
      if (row.fold != null) patient.folds.add(row.fold);
      patients.set(patientKey, patient);
    }
    const complete = source.membershipComplete && source.identityEvidence === 'observed' && unresolvedRecords === 0 &&
      source.records.length > 0 && (!source.expectedRecords || source.expectedRecords === ownRecords.size);
    if (!complete) issues.push({ code: 'incomplete-membership', source: source.id, reason: source.missingReason ?? 'Missing observed identities or manifest coverage' });
    sources.push({ id: source.id, dataset: source.dataset, version: source.version, role: source.role,
      identityEvidence: source.identityEvidence, membershipStatus: complete ? 'complete' : 'incomplete',
      recordCount: ownRecords.size, observedPatientCount: ownPatients.size, unresolvedRecords,
      declaredCount: source.declaredCount ?? null,
      metricEligibility: Object.fromEntries(METRICS.map(m => [m, metricEligibility(source.units, m)])) });
  }
  for (const patient of patients.values()) if (patient.folds.size > 1) issues.push({ code: 'patient-fold-conflict', patientKey: patient.key, folds: [...patient.folds].sort() });
  // Canonical IDs are unioned across versions; additional changed IDs still need a crosswalk.
  const datasetVersions = new Map();
  for (const source of inventory.sources) {
    const versions = datasetVersions.get(source.dataset) ?? new Set(); versions.add(source.version); datasetVersions.set(source.dataset, versions);
  }
  for (const [dataset, versions] of datasetVersions) if (versions.size > 1) issues.push({ code: 'cross-version-identity-unresolved', dataset, versions: [...versions].sort() });
  if (!inventory.coverageComplete) issues.push({ code: 'inventory-coverage-incomplete' });
  const overlap = [...patients.values()].filter(p => p.roles.has('exposed') && p.roles.has('candidate'));
  const candidates = sources.filter(s => s.role === 'candidate');
  if (!candidates.length) issues.push({ code: 'no-candidate-reserve' });
  const membershipComplete = issues.length === 0;
  const candidateMetricsEligible = candidates.length > 0 && candidates.every(s =>
    (inventory.requiredMetrics ?? METRICS).every(m => s.metricEligibility[m]?.eligible));
  return {
    schemaVersion: 1, inventoryStatus: membershipComplete ? 'complete' : 'incomplete',
    overlapStatus: membershipComplete ? 'known' : 'unknown',
    overlapCount: membershipComplete ? overlap.length : null,
    observedOverlapCount: overlap.length,
    observedExposedPatientCount: [...patients.values()].filter(p => p.roles.has('exposed')).length,
    observedCandidatePatientCount: [...patients.values()].filter(p => p.roles.has('candidate')).length,
    holdoutReady: membershipComplete && overlap.length === 0 && candidateMetricsEligible,
    candidateMetricsEligible, clinicalValidation: false,
    sources, issues,
    patients: [...patients.values()].map(p => ({ ...p, versions: [...p.versions].sort(), records: [...p.records].sort(), sources: [...p.sources].sort(), roles: [...p.roles].sort(), folds: [...p.folds].sort() })).sort((a, b) => a.key.localeCompare(b.key)),
    overlaps: overlap.map(p => ({ patientKey: p.key, sources: [...p.sources].sort() })),
  };
}
