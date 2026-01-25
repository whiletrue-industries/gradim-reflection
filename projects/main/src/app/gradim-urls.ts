export const GRADIM_WALL_URLS = [
  'https://gradim-wall.netlify.app/FB_P_ITA_200021_5770_013',
  'https://gradim-wall.netlify.app/FB_P_FRA_88009_0072_018',
  'https://gradim-wall.netlify.app/FB_P_IND_84010_016_809',
  'https://gradim-wall.netlify.app/FB_P_USA_82002_0211_036',
  'https://gradim-wall.netlify.app/FB_P_SUN_89009_1275_031',
] as const;

export function getRandomGradimUrl(): string {
  const randomIndex = Math.floor(Math.random() * GRADIM_WALL_URLS.length);
  return GRADIM_WALL_URLS[randomIndex];
}

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
