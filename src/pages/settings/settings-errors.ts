export function settingsErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The request could not be completed.';
}
