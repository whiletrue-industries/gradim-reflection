# Testing Instructions: Composition Download/Share Feature

## Overview
This document provides instructions for testing the download and share functionality for compositions containing iframe objects with og:image metadata.

## Prerequisites
- Development server running: `npm run start:sample`
- Browser with developer tools open (F12)

## Test Scenarios

### Test 1: Download composition with iframe og:image (Image Mode)

**Steps:**
1. Open the application at `http://localhost:4201`
2. Paste a URL that has og:image metadata (e.g., `https://github.com`)
3. Wait for the og:image to load (you should see a preview image)
4. Ensure the object is in "image mode" (the image icon button should be highlighted)
5. Click the "Download" button

**Expected Results:**
- ✅ A PNG file downloads automatically
- ✅ The downloaded image contains the og:image rendered in the composition
- ✅ If og:image fails to load (CORS), a placeholder with "Web Content" text is shown

### Test 2: Download composition with iframe og:image (iframe Mode)

**Steps:**
1. Continue from Test 1 (or add a new URL)
2. Click the globe/website icon to switch to iframe mode
3. The display should change to show the iframe
4. Click the "Download" button

**Expected Results:**
- ✅ A PNG file downloads automatically
- ✅ The downloaded image attempts to render the og:image (same as image mode)
- ✅ If og:image fails to load (CORS), a placeholder with "Web Content" text is shown

### Test 3: Download composition with iframe without og:image

**Steps:**
1. Open the application at `http://localhost:4201`
2. Paste a URL that doesn't have og:image metadata or where the metadata fetch fails
3. Click the "Download" button

**Expected Results:**
- ✅ A PNG file downloads automatically
- ✅ The downloaded image contains a placeholder box with "Web Content" text

### Test 4: Download composition with mixed content

**Steps:**
1. Open the application at `http://localhost:4201`
2. Drop an image file onto the canvas
3. Paste a URL with og:image (e.g., `https://github.com`)
4. Position and arrange both objects
5. Click the "Download" button

**Expected Results:**
- ✅ A PNG file downloads automatically
- ✅ The downloaded image contains both the dropped image AND the og:image (or placeholder)
- ✅ All objects maintain their positions, rotations, and sizes

### Test 5: Share functionality

**Steps:**
1. Create a composition with one or more objects (images and/or URLs)
2. Click the "Share" button

**Expected Results:**
- ✅ If Web Share API is available and supports files: Share dialog opens
- ✅ If Web Share API is not available: File downloads (fallback behavior)
- ✅ The shared/downloaded image contains properly rendered content

## Known Limitations

### CORS Restrictions
Many og:image URLs have CORS restrictions that prevent them from being loaded into a canvas context. When this happens:
- The implementation attempts to load the og:image with `crossOrigin = 'anonymous'`
- If loading fails, it gracefully falls back to the placeholder
- Console will show: "Failed to load og:image: Error: Failed to load image"

**URLs that typically work:**
- Images hosted on CORS-friendly CDNs
- Images from the same origin as the application

**URLs that typically fail:**
- GitHub og:images (CORS restricted)
- Many social media og:images
- Most websites that don't set CORS headers

### Testing with CORS-friendly URLs

To test the actual og:image rendering (without CORS fallback), you can:
1. Use a URL from a CORS-friendly service
2. Set up a local proxy that adds CORS headers
3. Use the development og:image fallback for known domains (already implemented for github.com)

## Console Monitoring

While testing, monitor the browser console for:
- `[Canvas] scheduleHashUpdate` - State updates
- `Failed to load og:image` warnings - Expected when CORS blocks loading
- Any error messages - Should be investigated

## Success Criteria

The feature is working correctly if:
1. ✅ Download button creates a PNG file
2. ✅ Image objects render correctly in downloads
3. ✅ Iframe objects with og:image render the image when CORS allows
4. ✅ Iframe objects without og:image or with CORS issues show placeholder
5. ✅ Share button uses Web Share API when available, falls back to download
6. ✅ All objects maintain their visual appearance in the download
7. ✅ No console errors (warnings about CORS are expected)

## Troubleshooting

### Download button doesn't work
- Check console for errors
- Verify objects exist on canvas (button is disabled when empty)
- Try clicking again (there might be a brief delay)

### Downloaded image is blank
- Check if composition has any objects
- Verify the objects are within the canvas bounds
- Check console for rendering errors

### og:image doesn't appear in download
- **This is expected behavior** for most URLs due to CORS
- Verify the placeholder appears instead (white box with "Web Content")
- Try with a CORS-friendly URL for actual og:image rendering
