# Design System

This document outlines design rules and shared conventions for the project. It complements the global styles in `projects/common/src/styles`.

## Themes

- Primary tokens are in `projects/common/src/styles/_variables.less`.
- Where possible, prefer using tokens instead of hard-coded values.

## Canvas Dark Theme

The sample Reflect canvas uses a dark theme for better focus and contrast.

- Background: `#121212` (near-black) to reduce glare.
- Grid: subtle dot grid using `rgba(255, 255, 255, 0.14)` at 1px.
- Surfaces (overlays, controls): dark neutrals (`rgba(20–30, 30–30, 0.9–0.95)`) with stronger shadows on dark.
- Text on dark: light neutrals (`#e6e6e6` – `#f0f0f0`).
- Primary actions: keep existing brand primary (`#007bff`) for active states to maintain familiarity and contrast.

## Accessibility

- Maintain WCAG AA color contrast on all text and interactive controls.
- Use light text on dark surfaces; prefer shadow strength ≥ `0 2px 8px rgba(0,0,0,0.4)` on dark.
- Keep focus-visible outlines; do not rely on color alone to convey state.

## Implementation Notes

- The canvas dark theme is scoped in `projects/sample-reflect/src/app/canvas/canvas.less` so it does not affect other apps or views.
- Future work: promote recurring dark tokens to `_variables.less` (e.g., `@color-surface-dark`, `@color-text-on-dark`) and refactor styles to consume tokens.