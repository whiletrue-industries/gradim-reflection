# Issue: Inflectable links for canvas

## Goal
Mirror canvas view (pan/zoom) and every canvas item into the URL hash, and restore state from the hash so copying the URL shares the exact view.

## Hash format
- Canvas: `#canvas/x,y,zoom`
- Item: `#<ref>/x,y,scale,rotation/type:<type>,ratio:<h-to-w>`
- `ref` is URL-encoded. Data URLs are tokenized (`token:<id>`) and persisted in localStorage for reloads; HTTP(S) refs are stored directly.
- Numbers rounded to 3 decimals.

## Behaviors
- State → hash: throttled updates on pan, zoom, move, scale, rotate, add.
- Hash → state: on load and `hashchange`, parse segments; ignore malformed entries; re-sanitize iframe URLs; clear selection.
- Size derivation: width = base 200 * scale; height = width * ratio; ratio stored in flags to preserve aspect.
- Safety: validate iframe URLs; skip unknown tokens; fall back to in-hash data URL if localStorage unavailable.

## Manual checks
- Add URL iframe, pan/zoom, move/scale/rotate item, confirm hash updates live.
- Reload page with hash, confirm canvas view and item restored.
- Copy URL to new tab, confirm same state.
- Drop image (data URL), confirm tokenization and reload works (via localStorage).
