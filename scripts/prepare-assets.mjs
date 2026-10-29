import { cp } from 'node:fs/promises';

// Vite serves public/ verbatim; copy the application artwork.
await cp(new URL('../src/assets/', import.meta.url), new URL('../public/assets/', import.meta.url), { recursive: true });
