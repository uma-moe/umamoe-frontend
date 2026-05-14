export function preferRasterAsset(path: string): string {
  if (!path) {
    return path;
  }

  return path.replace(/\.png(?=($|[?#]))/i, '.webp');
}