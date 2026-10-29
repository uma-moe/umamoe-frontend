import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PAGE_LAYOUT,
  REVIEW_VIEWPORTS,
  SCREEN_BREAKPOINTS,
  shellLayoutForWidth
} from './breakpoints';
import adRegionSource from './ads/AdRegion.svelte?raw';
import pageFrameSource from './PageFrame.svelte?raw';

const tokenSource = readFileSync(path.join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8');

describe('screen layout contract', () => {
  it('changes modes at the exact shell boundaries', () => {
    expect(shellLayoutForWidth(320)).toBe('mobile');
    expect(shellLayoutForWidth(767)).toBe('mobile');
    expect(shellLayoutForWidth(768)).toBe('compact');
    expect(shellLayoutForWidth(1279)).toBe('compact');
    expect(shellLayoutForWidth(1280)).toBe('compact');
    expect(shellLayoutForWidth(1439)).toBe('compact');
    expect(shellLayoutForWidth(1536)).toBe('compact');
    expect(shellLayoutForWidth(1799)).toBe('compact');
    expect(shellLayoutForWidth(1800)).toBe('expanded');
  });

  it('keeps every release review viewport assigned to a mode', () => {
    expect(REVIEW_VIEWPORTS.map(shellLayoutForWidth)).toEqual([
      'mobile',
      'mobile',
      'compact',
      'compact',
      'compact'
    ]);
  });

  it('keeps page frame container thresholds aligned with the screen contract', () => {
    expect(pageFrameSource).toContain(`min-width: ${SCREEN_BREAKPOINTS.compact}px`);
    expect(pageFrameSource).toContain(`min-width: ${SCREEN_BREAKPOINTS.expanded}px`);
  });

  it('locks page gutters and partner ad geometry into the layout component', () => {
    expect(tokenSource).toContain(`--page-gutter-mobile: ${PAGE_LAYOUT.gutters.mobile}px`);
    expect(tokenSource).toContain(`--page-gutter-compact: ${PAGE_LAYOUT.gutters.compact}px`);
    expect(tokenSource).toContain(`--page-gutter-expanded: ${PAGE_LAYOUT.gutters.expanded}px`);
    expect(tokenSource).toContain(
      `--page-content-normal: ${PAGE_LAYOUT.widths.normal.contentMax}px`
    );
    expect(tokenSource).toContain(`--page-content-wide: ${PAGE_LAYOUT.widths.wide.contentMax}px`);
    expect(tokenSource).toContain(`--page-frame-normal: ${PAGE_LAYOUT.widths.normal.frameMax}px`);
    expect(tokenSource).toContain(`--page-frame-wide: ${PAGE_LAYOUT.widths.wide.frameMax}px`);
    expect(tokenSource).toContain(`--ad-rail-width: ${PAGE_LAYOUT.ads.railWidth}px`);
    expect(tokenSource).toContain(`--ad-rail-gap: ${PAGE_LAYOUT.ads.railGap}px`);
    expect(tokenSource).toContain(
      `--ad-leaderboard-height: ${PAGE_LAYOUT.ads.leaderboardHeight}px`
    );
    expect(tokenSource).toContain(`--ad-mobile-height: ${PAGE_LAYOUT.ads.mobileHeight}px`);
    expect(tokenSource).toContain('--ad-inline-mobile-height: 100px');
    expect(pageFrameSource).toContain(`min-width: ${PAGE_LAYOUT.ads.railMin}px`);
    expect(adRegionSource).toContain(`min-width: ${PAGE_LAYOUT.ads.railMin}px`);
    expect(pageFrameSource).toContain(`min-width: ${PAGE_LAYOUT.ads.counterRailMin}px`);
    expect(pageFrameSource).toContain(`min-width: ${PAGE_LAYOUT.ads.balancedRailsMin}px`);
    expect(pageFrameSource).toContain('has-ad-rails');
    expect(pageFrameSource).toContain("grid-template-areas: 'content right-ad'");
    expect(pageFrameSource).toContain('var(--page-content-current)');
    expect(pageFrameSource).toContain('page-grid--wide');
    expect(pageFrameSource).toContain('data-page-width={width}');
    expect(pageFrameSource).toContain('var(--ad-rail-width)');
    expect(adRegionSource).toContain('var(--ad-mobile-height)');
    expect(adRegionSource).toContain('var(--ad-leaderboard-height)');
  });
});
