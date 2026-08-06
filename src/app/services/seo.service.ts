import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import seoPagesJson from '../../seo-pages.json';

interface SeoPage {
  title: string;
  description: string;
  index?: boolean;
  schema?: Record<string, unknown>[];
}

type SeoPages = Record<string, SeoPage>;

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly pages = seoPagesJson as SeoPages;
  private readonly siteUrl = 'https://uma.moe';
  private initialized = false;

  constructor(
    private readonly router: Router,
    private readonly meta: Meta,
    private readonly title: Title,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.applyForUrl(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.applyForUrl(event.urlAfterRedirects));
  }

  setPage(page: SeoPage, canonicalPath: string): void {
    const canonicalUrl = `${this.siteUrl}${canonicalPath === '/' ? '/' : canonicalPath}`;
    const robots = page.index === false
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    this.title.setTitle(page.title);
    this.upsertMeta('name', 'description', page.description);
    this.upsertMeta('name', 'robots', robots);
    this.upsertMeta('property', 'og:title', page.title);
    this.upsertMeta('property', 'og:description', page.description);
    this.upsertMeta('property', 'og:type', 'website');
    this.upsertMeta('property', 'og:url', canonicalUrl);
    this.upsertMeta('property', 'og:site_name', 'uma.moe');
    this.upsertMeta('property', 'og:image', `${this.siteUrl}/assets/logo.webp`);
    this.upsertMeta('name', 'twitter:card', 'summary');
    this.upsertMeta('name', 'twitter:title', page.title);
    this.upsertMeta('name', 'twitter:description', page.description);
    this.upsertMeta('name', 'twitter:image', `${this.siteUrl}/assets/logo.webp`);
    this.upsertCanonical(canonicalUrl);
    this.upsertStructuredData(this.buildStructuredData(page, canonicalPath, canonicalUrl));
  }

  private applyForUrl(url: string): void {
    const path = this.normalizePath(url);
    const exactPage = this.pages[path];
    if (exactPage) {
      this.setPage(exactPage, path);
      return;
    }

    if (path.startsWith('/circles/')) {
      this.setPage({
        title: 'Uma Musume Club Profile | uma.moe',
        description: 'View an Uma Musume Global club profile, member roster, fan progression, and activity.',
      }, path);
      return;
    }

    if (path.startsWith('/profile/')) {
      this.setPage({
        title: 'Uma Musume Trainer Profile | uma.moe',
        description: 'View an Uma Musume Global trainer profile, inheritance characters, rankings, and fan history.',
      }, path);
    }
  }

  private normalizePath(url: string): string {
    const path = url.split(/[?#]/, 1)[0] || '/';
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  }

  private buildStructuredData(
    page: SeoPage,
    canonicalPath: string,
    canonicalUrl: string,
  ): Record<string, unknown>[] {
    if (page.index === false) return [];

    const graph: Record<string, unknown>[] = [
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: page.title,
        description: page.description,
        isPartOf: { '@id': `${this.siteUrl}/#website` },
      },
      ...(page.schema ?? []),
    ];

    if (canonicalPath !== '/') {
      graph.push({
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'uma.moe',
            item: `${this.siteUrl}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: page.title.split('|', 1)[0].trim(),
            item: canonicalUrl,
          },
        ],
      });
    }

    return graph;
  }

  private upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
    const selector = `${attribute}='${key}'`;
    this.meta.updateTag({ [attribute]: key, content }, selector);
    const duplicates = this.meta.getTags(selector);
    duplicates.slice(1).forEach(tag => this.meta.removeTagElement(tag));
  }

  private upsertCanonical(url: string): void {
    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = url;

    const duplicates = Array.from(this.document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'));
    duplicates.slice(1).forEach(link => link.remove());
  }

  private upsertStructuredData(schema: Record<string, unknown>[]): void {
    const id = 'page-structured-data';
    this.document.getElementById(id)?.remove();
    if (!schema.length) return;

    const script = this.document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': schema,
    });
    this.document.head.appendChild(script);
  }
}
