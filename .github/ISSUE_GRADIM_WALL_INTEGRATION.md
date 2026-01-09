# Request: Enable URL Tracking for iframe Integration

## Summary

We're embedding gradim-wall in an iframe within our application. To provide a seamless user experience, we need to track the current URL as users navigate within gradim-wall so we can pass it to other features (like our reflection canvas).

Due to browser Same-Origin Policy, we cannot read the current URL from a cross-origin iframe. We need gradim-wall to actively send URL updates to the parent window via `postMessage`.

## Current Problem

When gradim-wall is loaded in an iframe from a different origin (e.g., `gradim-wall.netlify.app` inside `our-app.com`), the parent window cannot access:
- `iframe.contentWindow.location.href` 
- Any properties of the iframe's document or location

This is blocked by browsers with:
```
SecurityError: Blocked a frame with origin "http://our-app.com" from accessing a cross-origin frame.
```

## Requested Solution

Add JavaScript code to gradim-wall that sends the current URL to the parent window whenever:
1. The page initially loads
2. The URL changes (navigation within the SPA)

### Implementation

```javascript
// Send current URL to parent window
function notifyParentOfUrlChange() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'gradimWallUrlUpdate',
      url: window.location.href,
      timestamp: Date.now()
    }, '*');
  }
}

// On initial page load
notifyParentOfUrlChange();

// On SvelteKit page navigation
// (adjust based on your router implementation)
if (typeof window !== 'undefined') {
  // Listen for navigation events
  window.addEventListener('sveltekit:navigation-end', notifyParentOfUrlChange);
  
  // Or if using popstate for browser back/forward
  window.addEventListener('popstate', notifyParentOfUrlChange);
}
```

### For SvelteKit Specifically

If using SvelteKit's routing, you can add this to your root layout:

```svelte
<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  onMount(() => {
    // Send initial URL
    sendUrlToParent();
  });

  // Watch for route changes
  $: if ($page.url) {
    sendUrlToParent();
  }

  function sendUrlToParent() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'gradimWallUrlUpdate',
        url: window.location.href,
        timestamp: Date.now()
      }, '*');
    }
  }
</script>
```

## Message Format

**Type:** `gradimWallUrlUpdate`

**Payload:**
```typescript
{
  type: 'gradimWallUrlUpdate',
  url: string,           // Full current URL (e.g., "https://gradim-wall.netlify.app/gallery/123")
  timestamp: number      // Unix timestamp in milliseconds
}
```

## Security Considerations

### Origin Validation (Optional but Recommended)

If you want to restrict which parent origins can receive these messages, replace `'*'` with specific origins:

```javascript
const ALLOWED_ORIGINS = [
  'https://your-app.com',
  'http://localhost:4200',  // for local development
];

function notifyParentOfUrlChange() {
  if (window.parent && window.parent !== window) {
    ALLOWED_ORIGINS.forEach(origin => {
      window.parent.postMessage({
        type: 'gradimWallUrlUpdate',
        url: window.location.href,
        timestamp: Date.now()
      }, origin);
    });
  }
}
```

### Privacy Note

This only shares the URL of gradim-wall pages, not any user data or session information. The URL is already visible to users in their browser address bar.

## Benefits for gradim-wall

1. **Better iframe integration** - Makes gradim-wall easier to embed in other applications
2. **Standard web API** - Uses the well-supported `postMessage` API
3. **Optional feature** - Won't affect users who don't embed gradim-wall
4. **Minimal code** - ~10-20 lines of JavaScript
5. **No breaking changes** - Purely additive feature

## Alternative Approaches We've Tried

1. **Reverse Proxy** - Works but causes asset loading issues and requires complex URL rewriting
2. **URL Interceptor Wrapper** - Still hits same-origin policy even with intermediate layers
3. **Manual URL Input** - Current workaround, but poor UX requiring users to copy/paste URLs

## Testing

You can test if it's working by:

1. Loading gradim-wall in an iframe from a different origin
2. Adding this listener in the parent page:
```javascript
window.addEventListener('message', (event) => {
  if (event.data.type === 'gradimWallUrlUpdate') {
    console.log('Received URL update:', event.data.url);
  }
});
```
3. Navigate around gradim-wall and verify the console logs show URL updates

## Questions?

Happy to discuss implementation details or provide more context about our use case!

---

**Repository:** https://github.com/whiletrue-industries/gradim-reflection  
**Related Issue:** #29
