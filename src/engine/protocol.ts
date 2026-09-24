import type { ECGCase, Signal, Measurement } from "./types";
export interface SignalRequest {
  id: number;
  ecg: ECGCase;
  duration: number;
}
export type SignalResponse =
  | { id: number; signal: Signal; measurement: Measurement }
  | { id: number; error: string };
