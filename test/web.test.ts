import { describe, expect, it } from 'vitest';
import { diffText, discoverPages, extractText, isMeaningful } from '../src/web';

const HOME = `<html><head><title>Studio X</title><script>var x=1</script><style>p{}</style></head><body>
<header><nav><a href="/">Home</a><a href="/diensten/">Diensten</a><a href="/cases">Onze cases</a>
<a href="/cases/shop-for-acme">Acme shop</a><a href="https://www.studiox.example/vacatures">Werken bij</a>
<a href="https://other.example/blog">Partner blog</a><a href="/blog/">Blog</a><a href="/brochure.pdf">Brochure</a></nav></header>
<main><h1>We build Shopify stores &amp; brands</h1><p>Full-service agency in Utrecht working for retail brands since 2012.</p>
<div class="cookie-banner"><p>We use cookies to improve your experience.</p></div></main>
<footer><p>© 2026 Studio X. All rights reserved.</p></footer></body></html>`;

describe('extractText', () => {
  it('keeps main content and drops scripts, navigation, footer and cookie notices', () => {
    expect(extractText(HOME)).toBe('We build Shopify stores & brands\nFull-service agency in Utrecht working for retail brands since 2012.');
  });
});

describe('discoverPages', () => {
  it('finds key pages in other languages, on the same site only, preferring index pages', () => {
    expect(discoverPages(HOME, 'https://www.studiox.example/')).toEqual([
      { kind: 'home', url: 'https://www.studiox.example/' },
      { kind: 'services', url: 'https://www.studiox.example/diensten/' },
      { kind: 'work', url: 'https://www.studiox.example/cases' },
      { kind: 'news', url: 'https://www.studiox.example/blog/' },
      { kind: 'careers', url: 'https://www.studiox.example/vacatures' },
    ]);
  });
});

describe('diffText', () => {
  const before = 'Our work\nShopify store for a fashion brand with 40 products launched in 2025\nRebrand for a bakery chain across 12 locations';

  it('ignores changed numbers and short lines', () => {
    const after = 'Our work!\nShopify store for a fashion brand with 55 products launched in 2026\nRebrand for a bakery chain across 12 locations';
    const d = diffText(before, after);
    expect(d.added).toEqual([]);
    expect(isMeaningful(d)).toBe(false);
  });

  it('reports genuinely new content', () => {
    const added = 'New case study: headless Shopify Plus migration for a European sports retailer with 200k monthly visitors and custom ERP integration';
    const d = diffText(before, before + '\n' + added);
    expect(d.added).toEqual([added]);
    expect(isMeaningful(d)).toBe(true);
    expect(d.ratio).toBeGreaterThan(0.4);
  });
});
