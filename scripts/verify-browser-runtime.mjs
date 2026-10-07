/** CI preflight only: do not download browsers or alter the installed toolchain. */
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url);
const expected=JSON.parse(await readFile('package.json','utf8')).devDependencies.playwright;
assert.match(expected,/^\d+\.\d+\.\d+$/,'Browser tooling must use an exact release');
assert.equal(require('playwright/package.json').version,expected,'Installed Playwright differs from lock intent');
const browsers=[];
for(const engine of [chromium,firefox,webkit]) {
 const executable=engine.executablePath();await access(executable,constants.X_OK);
 browsers.push({name:engine.name(),executable});
}
console.log(JSON.stringify({playwright:expected,node:process.version,browsers,downloaded:false}));
