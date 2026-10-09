/**
 * Contract and unit tests run on the ideal acquisition (exact model arithmetic,
 * no resting noise floor, no quantization) so they check morphology and timing
 * deterministically. The product default is "realistic"; tests about noise or
 * realism opt in explicitly with `acquisition: "realistic"`.
 */
import { DEFAULT_CASE } from "../../src/engine/types";
import { ensureLearnedModel } from "../../src/ui/activation-model";

// Keep the product default visible to the test that guards it.
(globalThis as { productAcquisition?: unknown }).productAcquisition = DEFAULT_CASE.acquisition;
DEFAULT_CASE.acquisition = "ideal";
// The browser lab loads the learned model on demand; tests preload it.
await ensureLearnedModel();
