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

  if (!raw) {
    // Heuristic: Gradim Wall links map to Omeka-S large images
    // Example:
    //  Page: https://gradim-wall.netlify.app/FB_P_USA_80002_0130_030
    //  Image: https://gradim.fh-potsdam.de/omeka-s/files/large/FB_P_USA_80002_0130_030.jpg
    try {
      const u = new URL(pageUrl);
      const host = u.hostname.toLowerCase();
      if (host === 'gradim-wall.netlify.app') {
        const segs = u.pathname.split('/').filter(Boolean);
        const id = decodeURIComponent(segs[segs.length - 1] || '');
        if (id && /^[A-Za-z0-9_\-]+$/.test(id)) {
          return `https://gradim.fh-potsdam.de/omeka-s/files/large/${id}.jpg`;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

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
