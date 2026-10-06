import { setupCatalogFixtures } from '../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseUqlLanguage } from './database-uql-language';

describe('Angular UQL editor language', () => {
  let language: ReturnType<typeof createDatabaseUqlLanguage>;
  beforeEach(() => { language = createDatabaseUqlLanguage([], [], [{ id: 1, name: 'Arima Kinen', shortName: 'Arima', saddleIds: [101, 102], grade: 'G1' }]); });
  it('completes the field or value at the cursor without replacing surrounding predicates', () => {
    const text = 'Speed >= 3 and GP1 Lon and White count >= 12';
    const cursor = text.indexOf(' and White');
    const result = language.completeForEditor(text, cursor)!;
    // Captured from the current Angular editor: only the value after GP1 is replaced.
    expect(result.options.some(option => option.insertText === 'Long')).toBe(true);
    expect(text.slice(result.from, result.to)).toBe('Lon');
    expect(text.slice(result.to)).toBe(' and White count >= 12');
    const scoped = language.completeForEditor('Main Sp', 7)!;
    expect(scoped.options.some(option => option.label === 'Speed')).toBe(true);
    const races = language.completeForEditor('Race wins in (Ari', 17)!;
    expect(races.options.some(option => option.label === 'Arima Kinen' && option.backendValue === '101, 102')).toBe(true);
    // Completing from inside an existing bracket pair must replace its closing bracket too.
    for (const value of ['[]', '[Grass Wonder]', '[Tokai Teio [Anime Collab]]']) {
      const query = `owned legacy = ${value} and Speed >= 3`;
      const completion = language.completeForEditor(query, query.indexOf('[') + 1)!;
      expect(query.slice(completion.from, completion.to)).toBe(value);
      expect(query.slice(completion.to)).toBe(' and Speed >= 3');
    }
  });
  it('preserves token source positions, quoted values and factor chip metadata', () => {
    expect(language.tokenizeForEditor('Groundwork = 3x').some(segment => segment.kind === 'number' && segment.text === '3x')).toBe(true);
    const countQuery = 'Groundwork = 3x ';
    expect(language.completeForEditor(countQuery, countQuery.length)?.options.some(option => option.label.toLowerCase() === 'and')).toBe(true);
    const text = "Main Straightaway Adept >= 2 and trainer_name = 'Speed >= 3'";
    const segments = language.tokenizeForEditor(text);
    expect(segments.map(segment => segment.text).join('')).toBe(text);
    for (const segment of segments) expect(text.slice(segment.sourceStart, segment.sourceEnd)).toBe(segment.text);
    expect(segments.some(segment => segment.text === 'Main Straightaway Adept' && segment.valueContext === 'white-factor' && segment.scopeContext === 'main')).toBe(true);
    expect(language.tokenizeForEditor('has Straightaway Adept').some(segment => segment.text === 'Straightaway Adept' && segment.imageUrl)).toBe(true);
    expect(segments.some(segment => segment.kind === 'string' && segment.text === "'Speed >= 3'")).toBe(true);
    const repeated = language.tokenizeForEditor(text);
    expect(language.tokenizeForEditor(text)).toBe(repeated);
  });
});
