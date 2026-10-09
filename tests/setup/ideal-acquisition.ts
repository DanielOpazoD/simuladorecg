/**
 * Contract and unit tests run on the ideal acquisition (exact model arithmetic,
 * no resting noise floor, no quantization) so they check morphology and timing
 * deterministically. The product default is "realistic"; tests about noise or
 * realism opt in explicitly with `acquisition: "realistic"`.
 */
import { DEFAULT_CASE } from "../../src/engine/types";
import { ensureLearnedModel } from "../../src/ui/activation-model";

DEFAULT_CASE.acquisition = "ideal";
// The browser lab loads the learned model on demand; tests preload it.
await ensureLearnedModel();
