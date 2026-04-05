// Shared utility for fetching random archive image URLs from the Gradim Omeka-S API.
// Returns direct JPEG image URLs (files/large/) rather than Gradim Wall page URLs.

const RANDOM_API_LEAN_URL =
  'https://gradim.fh-potsdam.de/omeka-s/api/items?per_page=1&sort_by=random&fields[]=dcterms:identifier';
const RANDOM_API_URL =
  'https://gradim.fh-potsdam.de/omeka-s/api/items?per_page=1&sort_by=random';
const OMEKA_LARGE_BASE = 'https://gradim.fh-potsdam.de/omeka-s/files/large/';

type IdentifierProperty = { '@value'?: string };
type OmekaItem = { ['dcterms:identifier']?: IdentifierProperty[] };

async function fetchIdentifier(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload: OmekaItem[] = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const id = payload[0]?.['dcterms:identifier']?.[0]?.['@value'];
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** Fetches a single random archive image URL (direct JPEG). */
export async function fetchRandomArchiveImageUrl(): Promise<string | null> {
  const id =
    (await fetchIdentifier(RANDOM_API_LEAN_URL)) ??
    (await fetchIdentifier(RANDOM_API_URL));
  return id ? `${OMEKA_LARGE_BASE}${id}.jpg` : null;
}

/** Fetches `count` random archive image URLs in parallel. */
export async function fetchMultipleArchiveImageUrls(count: number): Promise<string[]> {
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => fetchRandomArchiveImageUrl()),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((url): url is string => url !== null);
}
