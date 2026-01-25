const WALL_BASE_URL = 'https://gradim-wall.netlify.app';
const RANDOM_API_URL = 'https://gradim.fh-potsdam.de/omeka-s/api/items?per_page=1&sort_by=random';

type IdentifierProperty = { '@value'?: string };
type OmekaItem = {
  ['dcterms:identifier']?: IdentifierProperty[];
};

export async function fetchRandomGradimUrlFromApi(): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;

  try {
    const response = await fetch(RANDOM_API_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;

    const payload: OmekaItem[] = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const identifier = payload[0]?.['dcterms:identifier']?.[0]?.['@value'];
    if (!identifier || typeof identifier !== 'string') return null;

    return `${WALL_BASE_URL}/${identifier}`;
  } catch {
    return null;
  }
}
