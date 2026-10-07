import { describe, it, expect } from 'vitest';
import { syncPauseControl } from '../src/ui/pause-control';
class ButtonProbe {
  disabled = false;
  attributes = new Map<string, string>();
  writes = 0;
  private html = '';
  get innerHTML() { return this.html; }
  set innerHTML(value: string) { this.writes++; this.html = value; }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}
describe('pause control projection', () => {
  it('preserves child nodes through repeated unrelated redraws', () => {
    const button = new ButtonProbe();
    syncPauseControl(button, false, true);
    for (let i = 0; i < 10; i++) syncPauseControl(button, false, true);
    expect(button.writes).toBe(1);
    expect(button.getAttribute('aria-label')).toBe('Congelar');
    expect(button.disabled).toBe(false);
  });
  it('preserves a frozen target but updates availability', () => {
    const button = new ButtonProbe();
    syncPauseControl(button, true, true);
    syncPauseControl(button, true, false);
    expect(button.disabled).toBe(true);
    expect(button.writes).toBe(1);
    expect(button.innerHTML).toContain('Reanudar');
  });
  it('changes icon and label only for real state transitions', () => {
    const button = new ButtonProbe();
    syncPauseControl(button, false, false);
    expect(button.disabled).toBe(true);
    syncPauseControl(button, true, true);
    expect(button.innerHTML).toContain('Reanudar');
    syncPauseControl(button, false, true);
    expect(button.innerHTML).toContain('Congelar');
    expect(button.getAttribute('aria-label')).toBe('Congelar');
    expect(button.writes).toBe(3);
  });
});
