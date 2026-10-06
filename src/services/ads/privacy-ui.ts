import { readable } from 'svelte/store';
import { isElementVisible } from '@/lib/element-visibility';

// Quantcast's consent UI lives outside our native dialogs. A modal would make
// its controls inert while its focus trap keeps taking focus from the modal.
export const privacyUiOpen = readable(false, set => {
  if (typeof document === 'undefined') return;
  let ui: HTMLElement | null;
  const update = () => {
    ui = document.getElementById('qc-cmp2-ui');
    set(Boolean(ui && !ui.closest('dialog') && isElementVisible(ui, { visibilityProperty: true })));
  };
  const observer = new MutationObserver(records => {
    // App rendering and ad refreshes must not repeatedly force consent layout checks.
    if (records.some(record => record.type === 'childList' ? !ui?.isConnected
      : record.target instanceof Element && (record.target.contains(ui) || record.target.id === 'qc-cmp2-ui'))) update();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'id'] });
  update();
  return () => observer.disconnect();
});
