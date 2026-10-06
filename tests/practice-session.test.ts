import { describe, expect, it } from "vitest";
import { PRESETS, presetById } from "../src/presets/catalog";
import { PRACTICE_IDS, practiceQuestion } from "../src/ui/practice-feedback";
import { answerPractice, createPractice } from "../src/ui/practice-session";

describe("practice session", () => {
  it.each(PRACTICE_IDS)("keeps the original question and four option orders for %s", (id) => {
    const before = JSON.stringify(PRESETS);
    for (let position = 0; position < 4; position++) {
      const random = [PRACTICE_IDS.indexOf(id), position];
      const question = practiceQuestion(random);
      const state = createPractice(random);
      expect(state.preset).toBe(presetById(question.id));
      expect(state.choices.map(p => p.id)).toEqual(question.choices);
      expect(state.answer).toBeNull();
    }
    expect(JSON.stringify(PRESETS)).toBe(before);
  });

  it("normalizes random inputs using the unchanged question generator", () => {
    expect(createPractice([NaN, Infinity])).toEqual(createPractice([0, 0]));
  });

  it.each([undefined, "", "not-a-choice"])("rejects invalid answers: %s", answer => {
    const state = createPractice([0, 0]);
    expect(answerPractice(state, answer, true)).toBe(false);
    expect(state.answer).toBeNull();
  });

  it("rejects answers outside a session or while the signal is unavailable", () => {
    expect(answerPractice(null, "sinus", true)).toBe(false);
    const state = createPractice([0, 0]);
    expect(answerPractice(state, state.preset.id, false)).toBe(false);
    expect(state.answer).toBeNull();
    expect(answerPractice(state, state.preset.id, true)).toBe(true);
  });

  it.each(["sinus", "af"])("accepts a curated answer once without changing the question: %s", answer => {
    const state = createPractice([0, 0]);
    const preset = state.preset;
    const choices = [...state.choices];
    expect(answerPractice(state, answer, true)).toBe(true);
    expect(state.answer).toBe(answer);
    expect(answerPractice(state, "av1", true)).toBe(false);
    expect(state.answer).toBe(answer);
    expect(state.preset).toBe(preset);
    expect(state.choices).toEqual(choices);
    expect(createPractice([0, 0]).answer).toBeNull();
  });
});
