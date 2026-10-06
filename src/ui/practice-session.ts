import { presetById, type Preset } from "../presets/catalog";
import { practiceQuestion } from "./practice-feedback";

export interface PracticeState {
  preset: Preset;
  choices: Preset[];
  answer: string | null;
}

export function createPractice(random: readonly number[]): PracticeState {
  const question = practiceQuestion(random);
  return {
    preset: presetById(question.id)!,
    choices: question.choices.map(id => presetById(id)!),
    answer: null,
  };
}

export function answerPractice(
  state: PracticeState | null,
  answer: string | undefined,
  canExport: boolean,
): boolean {
  if (!state || state.answer || !canExport || !state.choices.some(p => p.id === answer))
    return false;
  state.answer = answer!;
  return true;
}
