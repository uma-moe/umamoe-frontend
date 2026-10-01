import { initializeSentry } from './sentry';

// Evaluate before app/polyfill modules so their runtime failures can be buffered.
document.documentElement.dataset.appPhase = 'app-modules';
document.documentElement.dataset.nativePopover = String(typeof HTMLElement.prototype.showPopover === 'function');
void initializeSentry();
