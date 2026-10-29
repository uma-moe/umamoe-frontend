/// <reference types="vite/client" />

declare const __APP_ENVIRONMENT__: string;
declare const __UI_LAB_ENABLED__: boolean;
declare const __APP_CONFIG__: {
  siteKey: string;
  measurementId: string;
  providersEnabled: boolean;
  statusApiUrl: string;
  fuseSlots: Record<string, string>;
};

declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component;
  export default component;
}
