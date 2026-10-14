import { resourceRepository } from '@/lib/catalog/resource-repository';
import type { AffinityData } from './affinity-engine';

function validate(value: AffinityData): AffinityData {
  if (!value || !Array.isArray(value.chars) || !Array.isArray(value.aff2) || !Array.isArray(value.aff3)) {
    throw new Error('The moe affinity resource is invalid.');
  }
  const size = value.chars.length;
  if (value.aff2.length < size * size || value.aff3.length < size * size * size) {
    throw new Error('The moe affinity resource is incomplete.');
  }
  return value;
}

export const veteranAffinityRepository = {
  async load(refresh = false): Promise<AffinityData> {
    return validate(await resourceRepository.load<AffinityData>('affinity', refresh));
  }
};
