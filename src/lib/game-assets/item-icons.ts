const icons = import.meta.glob<string>('/src/assets/images/item/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
});

export function itemIconPath(id: number): string {
  return icons[`/src/assets/images/item/item_icon_${String(id).padStart(5, '0')}.webp`] ?? '';
}
