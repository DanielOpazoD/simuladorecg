import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import{createHash}from'node:crypto';import assert from 'node:assert/strict';
import{compareReports}from'./lib/noise-regression.mjs';import{reviewSecondarySTTransition}from'./lib/secondary-st-transition.mjs';
const [beforeFile,afterFile,output,...extra]=process.argv.slice(2);assert.ok(output&&!extra.length,'Provide before, after and output');
const contract=JSON.parse(await readFile('docs/qrs-coupled-repolarization-contract.json')),policy=JSON.parse(await readFile('benchmarks/noise-stress/acceptance.json'));
assert.equal(createHash('sha256').update(await readFile('scripts/lib/secondary-st-prediction.mjs')).digest('hex'),contract.secondarySTMigration.predictionHelperSha256,'Unreviewed source prediction');
const before=JSON.parse(await readFile(beforeFile)),after=JSON.parse(await readFile(afterFile));
assert.equal(before.sourceCommit,contract.secondarySTMigration.preSTProductCommit,'Wrong pre-ST product');
const strict=compareReports(before,after,{...policy.numericalTolerance,allowedCleanSourceChanges:contract.secondarySTMigration.changedNoiseSources});
// Persist every strict failure even when the migration bounds themselves fail.
await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,JSON.stringify({strict},null,2)+'\n');
const migration=reviewSecondarySTTransition(strict);await writeFile(output,JSON.stringify({migration,strict,contract},null,2)+'\n');console.log(JSON.stringify(migration));
