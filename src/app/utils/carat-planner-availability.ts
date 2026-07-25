const CARAT_PLANNER_BETA_HOST = 'beta.uma.moe';
const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isCaratPlannerAvailable(hostname?: string): boolean {
  const runtimeHostname = hostname
    ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  const normalizedHostname = runtimeHostname.trim().toLowerCase().replace(/\.$/, '');

  return normalizedHostname === CARAT_PLANNER_BETA_HOST
    || LOCAL_DEVELOPMENT_HOSTS.has(normalizedHostname);
}
