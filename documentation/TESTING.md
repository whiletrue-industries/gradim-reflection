# Testing Guide

## Manual: Inflectable canvas hash
1. Open sample-reflect app, add an iframe by pasting a URL. Observe location hash updates as you pan/zoom/move/rotate.
2. Reload the page with the populated hash; canvas pan/zoom and the iframe position/size/rotation should match.
3. Copy the URL to a new tab; the same state should appear.
4. Drop an image file (data URL); verify it appears, the hash updates, and a reload restores it (requires localStorage for tokenized data URLs).
5. Try malformed hashes (remove parts) and confirm app ignores bad entries without breaking existing objects.
