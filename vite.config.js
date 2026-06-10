import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 4200,
    allowedHosts: [
      'uma.moe',
      'www.uma.moe',
      'localhost',
      '127.0.0.1',
      'host.docker.internal',
    ],
  },
});
