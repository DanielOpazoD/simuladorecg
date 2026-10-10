/** Presentation-only keyboard/focus support for the existing workspaces.
 * Does not own ECG, annotation or worker state.
 * One child-list observer covers existing synchronous/asynchronous re-renders.
 */
export function tabDestination(key: string, index: number, length: number): number | null {
  if (length < 1 || index < 0 || index >= length) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight') return (index + 1) % length;
  if (key === 'ArrowLeft') return (index + length - 1) % length;
  return null;
}

const identityAttributes = ['data-key','data-action','data-panel','data-mode','data-id','data-preset'] as const;
function selectorFor(el: HTMLElement): string | null {
  if (el.id) return '#' + CSS.escape(el.id);
  const attrs = identityAttributes.filter(a => el.hasAttribute(a));
  return attrs.length ? el.tagName.toLowerCase() + attrs.map(a => `[${a}="${CSS.escape(el.getAttribute(a)!)}"]`).join('') : null;
}
function available(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.isConnected && !el.matches(':disabled') && !el.closest('[inert],[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
}
function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')]
    .filter(el => available(el) && el.tabIndex >= 0);
}

export function installAccessibility() {
  const app = document.querySelector<HTMLElement>('#app')!;
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  const catalog = document.querySelector<HTMLElement>('#catalog')!;
  const topbar = document.querySelector<HTMLElement>('.topbar')!;
  const trigger = document.querySelector<HTMLButtonElement>('[data-action=catalog]')!;
  const mobile = matchMedia('(max-width: 800px)');
  const backdrop = document.createElement('div');
  backdrop.className = 'catalog-backdrop'; backdrop.hidden = true; backdrop.setAttribute('aria-hidden','true');
  app.append(backdrop);
  const title = document.querySelector<HTMLElement>('#case-title')!;
  title.tabIndex = -1;
  document.querySelector<HTMLElement>('.sidebar-head h2')!.id = 'catalog-title';
  document.querySelector<HTMLElement>('#inspector')!.tabIndex = -1;
  trigger.setAttribute('aria-controls','catalog');
  topbar.insertAdjacentHTML('beforebegin', '<nav class="skip-links" aria-label="Accesos directos"><a href="#case-title">Ir al simulador</a><a href="#inspector">Ir a parámetros</a></nav>');
  const skips = document.querySelector<HTMLElement>('.skip-links')!;
  skips.addEventListener('click', e => {
    const anchor = (e.target as Element).closest<HTMLAnchorElement>('a');
    const target = anchor && document.querySelector<HTMLElement>(anchor.hash);
    if (target) {e.preventDefault(); target.focus(); target.scrollIntoView({block:'start'});}
  });

  // If an existing renderer replaces the focused node, restore its equivalent.
  // Never steal focus from a real navigation target, an open dialog or a newer focus.
  let last: {node:HTMLElement; selector:string|null; root:HTMLElement} | null = null;
  const returns = new WeakMap<HTMLDialogElement, {root:HTMLElement; selector:string|null}>();
  document.addEventListener('focusin', e => {
    const node = e.target as HTMLElement;
    const dialog = node.closest<HTMLDialogElement>('dialog');
    if (dialog && last && last.root !== dialog && !dialog.contains(last.root) && !dialog.contains(last.node)) returns.set(dialog, last);
    last = {node, selector:selectorFor(node), root:node.closest<HTMLElement>('#diagnosis-navigation,#inspector,#scale-toolbar,#caliper-editor,#catalog') ?? dialog ?? app};
  });
  function restoreFocus() {
    if (!last || last.node.isConnected || document.activeElement !== document.body) return;
    const open = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (open && !open.contains(last.root) && open !== last.root) return;
    const replacement = last.selector ? last.root.querySelector<HTMLElement>(last.selector) : null;
    if (available(replacement)) replacement.focus({preventScroll:true});
  }
  // Native modal focus containment is retained; only a replaced opener needs help.
  document.addEventListener('close', e => {
    if (!(e.target instanceof HTMLDialogElement)) return;
    const dialog = e.target, back = returns.get(dialog);
    queueMicrotask(() => {
      if (dialog.open || !back?.selector) return;
      if (document.activeElement !== document.body && !dialog.contains(document.activeElement)) return;
      const node = back.root.querySelector<HTMLElement>(back.selector);
      if (available(node)) node.focus({preventScroll:true});
    });
  }, true);

  let catalogOpen = false;
  let selectedFromCatalog = false;
  function syncCatalog() {
    const concealed = catalog.classList.contains('quiz-concealed');
    const open = mobile.matches && !concealed && catalog.classList.contains('open');
    trigger.disabled = concealed;
    trigger.setAttribute('aria-expanded', String(open));
    catalog.inert = concealed || (mobile.matches && !open);
    if (catalog.inert) catalog.setAttribute('aria-hidden','true'); else catalog.removeAttribute('aria-hidden');
    workspace.inert = open; topbar.inert = open; skips.inert = open; backdrop.hidden = !open;
    if (open) {
      catalog.setAttribute('role','dialog');catalog.setAttribute('aria-modal','true');catalog.setAttribute('aria-labelledby','catalog-title');
      if (!catalogOpen) catalog.querySelector<HTMLInputElement>('#case-search')!.focus();
    } else {
      catalog.removeAttribute('role');catalog.removeAttribute('aria-modal');catalog.removeAttribute('aria-labelledby');
      if (catalogOpen) {
        if (selectedFromCatalog || !available(trigger)) title.focus(); else trigger.focus();
      }
      if ((!mobile.matches || concealed) && catalog.classList.contains('open')) catalog.classList.remove('open');
    }
    catalogOpen = open; selectedFromCatalog = false;
  }
  backdrop.addEventListener('click', () => catalog.classList.remove('open'));
  catalog.addEventListener('click', e => {selectedFromCatalog = !!(e.target as Element).closest('[data-preset]');},true);
  new MutationObserver(syncCatalog).observe(catalog,{attributes:true,attributeFilter:['class']});
  mobile.addEventListener('change',syncCatalog);
  syncCatalog();

  function enhance() {
    for (const list of document.querySelectorAll<HTMLElement>('.view-tabs,.control-tabs')) {
      const tabs = [...list.querySelectorAll<HTMLElement>('[role=tab]')];
      for (const tab of tabs) {
        const selected = tab.getAttribute('aria-selected') === 'true';
        tab.tabIndex = selected ? 0 : -1;
        const view = tab.dataset.mode;
        const name = view ?? tab.dataset.panel!;
        tab.id = (view ? 'view-tab-' : 'control-tab-') + name;
        const panel = view ? document.querySelector<HTMLElement>('#canvas-wrap') :
          document.querySelector<HTMLElement>(`[data-control-panel="${name}"]`);
        if (!panel) continue;
        if (!panel.id) panel.id = 'control-panel-' + name;
        tab.setAttribute('aria-controls',panel.id);
        panel.setAttribute('role','tabpanel');
        if (selected || !view) panel.setAttribute('aria-labelledby',tab.id);
      }
    }
    const heading = document.querySelector<HTMLElement>('#dialog-content h2');
    if (heading) {heading.id = 'model-dialog-title';document.querySelector('#dialog')!.setAttribute('aria-labelledby',heading.id);}
    // Horizontal data tables keep their two-dimensional meaning but are keyboard-scrollable.
    for (const wrap of document.querySelectorAll<HTMLElement>('.measurement-table-wrap')) {
      wrap.tabIndex = 0; wrap.setAttribute('role','region');
      const table = wrap.querySelector('table');
      const label = table?.querySelector('caption')?.textContent ?? wrap.closest('section')?.querySelector('h3')?.textContent ?? 'Tabla de medidas ECG';
      wrap.setAttribute('aria-label',label.trim() + '; desplazamiento horizontal');
    }
    document.querySelectorAll('thead th').forEach(th => th.setAttribute('scope','col'));
    const manual = document.querySelector<HTMLElement>('#manual-canvas');
    if (manual) manual.setAttribute('role','img');
    const synthetic = document.querySelector('#signal-loading');
    if (synthetic) workspace.setAttribute('aria-busy',String(!synthetic.hasAttribute('hidden') && !synthetic.classList.contains('signal-unavailable')));
  }
  document.addEventListener('focusout', e => {
    const list = (e.target as Element).closest<HTMLElement>('[role=tablist][data-activation=manual]');
    if (!list || (e.relatedTarget instanceof Node && list.contains(e.relatedTarget))) return;
    list.querySelectorAll<HTMLElement>('[role=tab]').forEach(tab => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    });
  });
  // Attributes written here are deliberately not observed: no self-triggering loop.
  new MutationObserver(() => {enhance();restoreFocus();}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click', () => queueMicrotask(enhance));
  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (catalogOpen) {
      if (e.key === 'Escape') {e.preventDefault();e.stopPropagation();catalog.classList.remove('open');return;}
      if (e.key === 'Tab') {
        const nodes = focusable(catalog), first = nodes[0], end = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {e.preventDefault();end?.focus();}
        else if (!e.shiftKey && document.activeElement === end) {e.preventDefault();first?.focus();}
      }
    }
    const tab = (e.target as Element).closest<HTMLElement>('[role=tab]');
    if (!tab) return;
    const list = tab.closest('[role=tablist]');
    const tabs = [...(list?.querySelectorAll<HTMLElement>('[role=tab]') ?? [])].filter(t => !t.matches(':disabled'));
    const index = tabDestination(e.key,tabs.indexOf(tab),tabs.length);
    if (index !== null) {
      e.preventDefault();e.stopPropagation();
      if (list?.getAttribute('data-activation') === 'manual') {
        // Changing an ECG triggers generation; arrows only move focus, Enter/Space load it.
        tabs.forEach((t,i) => {t.tabIndex = i === index ? 0 : -1;});
        tabs[index].focus();
      } else {
        tabs[index].click();enhance();
        document.getElementById(tabs[index].id)?.focus();
      }
    }
  },true);
  enhance();
}
