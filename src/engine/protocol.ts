import type { ECGCase, Signal, Measurement } from "./types";
export interface SignalRequest {
  id: number;
  ecg: ECGCase;
  duration: number;
  /** Also return the same patient without its acute lesion (the OMI lens's
   * previous ECG), when the case has one. */
  previous?: boolean;
}
export type SignalResponse =
  | { id: number; signal: Signal; measurement: Measurement; previous?: Signal }
  | { id: number; error: string; infrastructure?: true };
