// Browser APIs the app calls directly that core-js does not provide. Only the compatibility build loads this.
// Vite's legacy plugin bundles it without transpiling, so keep the syntax to what its oldest targets parse.
import { ResizeObserver as ResizeObserverPolyfill } from '@juggle/resize-observer';
import dialogPolyfill from 'dialog-polyfill';

if (typeof window.ResizeObserver !== 'function') window.ResizeObserver = ResizeObserverPolyfill;

if (window.crypto && typeof window.crypto.randomUUID !== 'function') {
  window.crypto.randomUUID = function randomUUID() {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => (byte + 0x100).toString(16).slice(1)).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

if (window.AbortSignal && typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(milliseconds) {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      milliseconds
    );

    return controller.signal;
  };
}

// Safari before 14 only offers addListener on media queries.
const mediaQueryList = window.MediaQueryList && MediaQueryList.prototype;
if (mediaQueryList && typeof mediaQueryList.addEventListener !== 'function') {
  mediaQueryList.addEventListener = function addEventListener(type, listener) {
    if (type === 'change') this.addListener(listener);
  };

  mediaQueryList.removeEventListener = function removeEventListener(type, listener) {
    if (type === 'change') this.removeListener(listener);
  };
}

// Without native support a <dialog> is an HTMLUnknownElement; upgrade it on its first dialog call.
if (typeof window.HTMLDialogElement !== 'function') {
  for (const method of ['show', 'showModal', 'close']) {
    HTMLUnknownElement.prototype[method] = function upgradeDialog(...args) {
      if (this.localName !== 'dialog') throw new TypeError(`${method} is not a function`);
      // The polyfill treats an existing showModal as native support.
      this.showModal = undefined;
      dialogPolyfill.registerDialog(this);
      return this[method](...args);
    };
  }

  const style = document.createElement('style');
  style.textContent =
    'dialog:not([open]){display:none}' +
    'dialog[open]{display:block;position:fixed}' +
    'dialog+.backdrop,._dialog_overlay{position:fixed;top:0;right:0;bottom:0;left:0}' +
    'dialog+.backdrop{background:rgba(0,0,0,.68)}';
  document.head.appendChild(style);
}
