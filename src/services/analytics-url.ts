export function sanitizeAnalyticsUrl(value: string): string {
  const url = new URL(value, location.origin);
  // Query and fragment payloads include UQL, trainer searches and shared plans.
  // Only the route shape belongs in analytics; user IDs/names stay in the app.
  return url.pathname.replace(/\/(profile|activity|shame|clubs|circles|veterans)\/[^/]+/g, '/$1/:id');
}
