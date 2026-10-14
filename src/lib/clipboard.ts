export async function copyText(value: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(value); return true; }
  catch { /* Older browsers and denied permissions can still allow a user-initiated copy. */ }
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  try {
    (focused?.closest('dialog[open]') ?? document.body).append(input);
    input.select();
    return document.execCommand('copy');
  } catch { return false; }
  finally {
    input.remove();
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
}
