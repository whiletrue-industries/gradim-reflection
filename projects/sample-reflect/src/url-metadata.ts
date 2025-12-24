// Utility to extract a preview image URL (og:image or equivalents) from HTML
// and resolve it against the page URL when needed.

export function extractPreviewImage(html: string, pageUrl: string): string | null {
  const patterns: RegExp[] = [
    // og:image:secure_url
    /<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image:secure_url["'][^>]*>/i,
    // og:image
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*>/i,
    // twitter:image
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:image["'][^>]*>/i,
    // itemprop="image"
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']*)["'][^>]*itemprop=["']image["'][^>]*>/i,
  ];

  let raw: string | null = null;
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      raw = m[1].trim();
      break;
    }
  }

  if (!raw) return null;

  try {
    const base = new URL(pageUrl);
    // Handle protocol-relative URLs
    if (raw.startsWith('//')) {
      raw = `${base.protocol}${raw}`;
    }
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}
