const WALL_BASE_URL = 'https://gradim-wall.netlify.app';
const RANDOM_API_URL = 'https://gradim.fh-potsdam.de/omeka-s/api/items?per_page=1&sort_by=random';
const RANDOM_API_LEAN_URL = `${RANDOM_API_URL}&fields[]=dcterms:identifier`;

type IdentifierProperty = { '@value'?: string };
type OmekaItem = {
  ['dcterms:identifier']?: IdentifierProperty[];
};

export async function fetchRandomGradimUrlFromApi(): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;

  try {
    const identifier = await fetchIdentifier(RANDOM_API_LEAN_URL) ?? await fetchIdentifier(RANDOM_API_URL);
    if (!identifier) return null;

    return `${WALL_BASE_URL}/${identifier}`;
  } catch {
    return null;
  }
}

async function fetchIdentifier(url: string): Promise<string | null> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;

  const payload: OmekaItem[] = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) return null;

  const identifier = payload[0]?.['dcterms:identifier']?.[0]?.['@value'];
  return typeof identifier === 'string' ? identifier : null;
}
