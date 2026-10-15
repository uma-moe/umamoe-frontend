import featureManifest from '../../../contracts/features.json';
import { runtimeConfig } from '@/services/runtime-config';

export function adSurfaceForRoute(routeId: string): string | null {
  return featureManifest.features.find((feature) => feature.id === routeId)?.adSurface ?? null;
}

export function fuseIdForPlacement(placement: string): string {
  return runtimeConfig.fuseSlots[placement] ?? '';
}
