import { icon } from './helpers';

type PauseButton = Pick<HTMLButtonElement, 'disabled' | 'getAttribute' | 'setAttribute' | 'innerHTML'>;

/** Preserve the live click target when a redraw does not change pause state. */
export function syncPauseControl(button: PauseButton, paused: boolean, enabled: boolean): void {
  button.disabled = !enabled;
  const label = paused ? 'Reanudar' : 'Congelar';
  if (button.getAttribute('aria-label') === label) return;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(paused ? 'play' : 'pause') + `<span>${label}</span>`;
}
