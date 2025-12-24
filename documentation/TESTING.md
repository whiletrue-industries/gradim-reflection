# Testing Guide

## Manual: Inflectable canvas hash
1. Open sample-reflect app, add an iframe by pasting a URL. Observe location hash updates as you pan/zoom/move/rotate.
2. Reload the page with the populated hash; canvas pan/zoom and the iframe position/size/rotation should match.
3. Copy the URL to a new tab; the same state should appear.
4. Drop an image file (data URL); verify it appears, the hash updates, and a reload restores it (requires localStorage for tokenized data URLs).
5. Try malformed hashes (remove parts) and confirm app ignores bad entries without breaking existing objects.

## Unit: URL metadata extraction

We use Vitest for a light-weight unit test that verifies our HTML meta parsing and URL resolution logic used by the `/api/url-metadata` endpoint.

Run tests with Vitest:

```bash
npx vitest run projects/sample-reflect/src/url-metadata.spec.ts
```

What it covers:
- `og:image` absolute URL
- relative paths resolved against the page URL
- protocol-relative URLs (`//host/path`)
- fallbacks like `twitter:image`
- the B'Tselem example page
