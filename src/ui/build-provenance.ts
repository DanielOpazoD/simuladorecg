import { APP_VERSION } from './version';
import type { BuildProvenance } from '../io/external-review';

declare const __ECG_BUILD_PROVENANCE__: BuildProvenance;
/** Same immutable build identity emitted by Vite; archive/dev fallback is explicitly unknown. */
export function buildProvenance(): BuildProvenance {
  return typeof __ECG_BUILD_PROVENANCE__ === 'undefined'
    ? {appVersion:APP_VERSION, commit:'unknown', sourceSha256:'unknown', analysisSourceSha256:'unknown', dirty:true}
    : {...__ECG_BUILD_PROVENANCE__};
}
