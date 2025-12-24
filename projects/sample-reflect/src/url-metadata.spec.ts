import { describe, it, expect } from 'vitest';
import { extractPreviewImage } from './url-metadata';

describe('extractPreviewImage', () => {
  it('returns absolute og:image as-is', () => {
    const html = `
      <meta property="og:image" content="https://example.com/img/cover.png">
    `;
    const out = extractPreviewImage(html, 'https://example.com/page');
    expect(out).toBe('https://example.com/img/cover.png');
  });

  it('resolves relative og:image against base URL', () => {
    const html = `
      <meta property="og:image" content="/img/cover.png">
    `;
    const out = extractPreviewImage(html, 'https://example.com/nibal/');
    expect(out).toBe('https://example.com/img/cover.png');
  });

  it('resolves protocol-relative URL', () => {
    const html = `
      <meta property="og:image" content="//cdn.example.com/p/cover.png">
    `;
    const out = extractPreviewImage(html, 'https://example.com/page');
    expect(out).toBe('https://cdn.example.com/p/cover.png');
  });

  it('falls back to twitter:image when og:image missing', () => {
    const html = `
      <meta name="twitter:image" content="https://twimg.example/cover.png">
    `;
    const out = extractPreviewImage(html, 'https://example.org/');
    expect(out).toBe('https://twimg.example/cover.png');
  });

  it('parses the B\'Tselem example', () => {
    const html = `
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://projects.btselem.org/nibal/" />
      <meta property="og:title" content="..." />
      <meta property="og:description" content="..." />
      <meta property="og:image" content="https://projects.btselem.org/nibal/img/cover.png">
    `;
    const out = extractPreviewImage(html, 'https://projects.btselem.org/nibal/');
    expect(out).toBe('https://projects.btselem.org/nibal/img/cover.png');
  });
});
