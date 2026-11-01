// index.html starts the compatibility build in this browser instead; stop the modern copy before it runs.
if (!import.meta.env.LEGACY && document.documentElement.dataset.appBuild === 'compatibility') {
  throw new Error('This browser runs the compatibility build.');
}
