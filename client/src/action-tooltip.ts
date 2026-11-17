import { goodAgainst, weakAgainst } from '../../shared/counters.ts';
import { RESOURCE_LABELS, RESOURCE_TYPES, type Cost, type UnitType } from '../../shared/data.ts';

export function actionDetails(cost: Cost, seconds: number, unit?: UnitType): string {
  const prices = RESOURCE_TYPES.filter((r) => cost[r]).map((r) => `${cost[r]} ${RESOURCE_LABELS[r]}`);
  const lines = [`Cost: ${prices.join(', ') || 'Free'}`, `Time: ${Math.round(seconds * 10) / 10} s`];
  if (unit) {
    lines.push(`Beats: ${goodAgainst(unit).join(', ') || 'No specific bonus'}`);
    lines.push(`Fears: ${weakAgainst(unit).join(', ') || 'No listed counter'}`);
  }
  return lines.join('\n');
}

/** Shared action tooltip for pointer and keyboard use. */
export class ActionTooltip {
  private readonly tip = document.createElement('div');
  private hovered: HTMLElement | null = null;
  private focused: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private dismissed: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.tip.id = 'action-tooltip';
    this.tip.className = 'action-tooltip';
    this.tip.role = 'tooltip';
    this.tip.hidden = true;
    document.body.append(this.tip);

    const action = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('[data-action-tip]') : null;
    root.addEventListener('pointerover', (e) => {
      const next = action(e.target);
      if (!next || next === action(e.relatedTarget)) return;
      this.hovered = next;
      this.dismissed = null;
      this.update();
    });
    root.addEventListener('pointerout', (e) => {
      if (!this.hovered || (e.relatedTarget instanceof Node && this.hovered.contains(e.relatedTarget)) || e.relatedTarget === this.tip) return;
      this.hovered = null;
      this.update();
    });
    this.tip.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.update();
    });
    root.addEventListener('focusin', (e) => {
      this.focused = action(e.target);
      this.dismissed = null;
      this.update();
    });
    root.addEventListener('focusout', (e) => {
      this.focused = action(e.relatedTarget);
      this.update();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.anchor) {
        this.dismissed = this.anchor;
        this.update();
        e.preventDefault();
      }
    }, true);
    root.addEventListener('scroll', () => this.update(), true);
    window.addEventListener('resize', () => this.update());
  }

  refresh(): void {
    if (this.anchor && !this.anchor.isConnected) this.update();
  }

  private update(): void {
    if (this.hovered && !this.hovered.isConnected) this.hovered = null;
    if (this.focused && !this.focused.isConnected) this.focused = null;
    const candidate = this.hovered ?? this.focused;
    const next = candidate && candidate !== this.dismissed && candidate.getClientRects().length ? candidate : null;
    if (this.anchor !== next) this.anchor?.removeAttribute('aria-describedby');
    this.anchor = next;
    this.tip.hidden = !next;
    if (!next) return;
    next.setAttribute('aria-describedby', this.tip.id);
    this.tip.textContent = next.dataset.actionTip ?? '';
    const box = next.getBoundingClientRect();
    const left = Math.min(Math.max(8, box.left), window.innerWidth - this.tip.offsetWidth - 8);
    const above = box.top - this.tip.offsetHeight;
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${above >= 8 ? above : Math.min(box.bottom, window.innerHeight - this.tip.offsetHeight - 8)}px`;
  }
}
