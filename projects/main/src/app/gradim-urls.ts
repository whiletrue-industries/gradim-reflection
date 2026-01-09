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
