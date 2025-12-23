# Manual Test Checklist: Inflectable Links Feature

## Test Environment Setup
1. **Clear browser cache/localStorage:**
   - Open DevTools (F12)
   - Go to Application tab → Storage → Local Storage
   - Clear all entries for localhost:4200
   - Also clear Application → Cache → Delete all

2. **Reload the page:**
   - Press Ctrl+Shift+R (hard refresh) or Cmd+Shift+R on Mac
   - Check console for any JavaScript errors
   - Verify you see a blank canvas

---

## Feature 1: Backspace Deletion

**Steps:**
1. Paste or drop an image/content onto the canvas
2. Click on the item to select it (should appear with handles)
3. Press the **Backspace** key
4. Item should immediately disappear from canvas

**Expected Results:**
- ✅ Item is removed from canvas
- ✅ Selection is cleared
- ✅ No console errors
- ✅ URL hash updates (if hash-sync is working)

**If it fails:**
- Check browser console for errors
- Verify the object appears as selected (visual handles visible)
- Check that Backspace isn't being intercepted by another element

---

## Feature 2: Scaling with Aspect Ratio Preservation

**Steps:**
1. Drop an image onto the canvas (preferably a photo with clear aspect ratio)
2. Drag one of the corner handles (NW, NE, SW, SE)
3. Watch how the image resizes

**Expected Results:**
- ✅ Image resizes smoothly when dragging any corner
- ✅ Aspect ratio is maintained (image doesn't stretch/squash)
- ✅ Dragging NW corner scales from top-left
- ✅ Dragging SE corner scales from bottom-right
- ✅ The image frame and handles scale proportionally

**If it fails:**
- Image might distort/change aspect ratio
- Scaling might jump instead of smoothly following cursor
- Handles might not move with the image

---

## Feature 3: Hash Synchronization

**Steps:**

### Part A: Watch hash update on interactions
1. Open DevTools and go to the Console
2. Type: `window.location.hash` - should be empty initially
3. Drag an item on the canvas and watch the URL
4. The URL hash should update with `#canvas/...#ref/...` pattern
5. Perform multiple actions: pan, zoom, rotate, scale

**Expected Results:**
- ✅ Hash updates after actions (may be slightly delayed due to 80ms throttle)
- ✅ Hash contains canvas pan/zoom info
- ✅ Hash contains item position, rotation, scale
- ✅ No hash loop (hash shouldn't flip back and forth)

### Part B: Verify hash persistence
1. Make several changes to canvas (add items, move them, scale, rotate)
2. Check the URL - should show a complex hash like: `#canvas/x,y,zoom#ref/...#ref/...`
3. Copy the entire URL from the address bar
4. Open a new tab and paste the URL
5. The canvas should restore to the exact state shown in step 1

**Expected Results:**
- ✅ All items appear on the new tab
- ✅ Items are in the same positions, sizes, and rotations
- ✅ Canvas pan/zoom is restored
- ✅ URL hash matches what you copied

### Part C: Verify item data persistence
1. Drop an image onto the canvas
2. Check the browser's LocalStorage (DevTools → Application → Storage → Local Storage)
3. Should see entries like `file-data-imagename.jpg` (if using file drop)
4. Reload the page with F5
5. Item should still be visible on canvas

**Expected Results:**
- ✅ Items persist across reload
- ✅ Image data is stored in localStorage with filename key
- ✅ No broken/missing image icons

---

## Test Data

**For testing, you can use:**
- Drop images from your computer (any JPG/PNG)
- Right-click an image on any website, copy, and paste into canvas
- Paste URLs of publicly accessible images

**Example shareable canvas states:**
- Create 3-5 items with different scales and rotations
- Share the URL - others should see exact same layout
- Test with `http://localhost:4200/#canvas/0,0,1#ref/100,100,200,200,0/type:IMAGE,ratio:1.5#ref/300,400,150,150,45/type:IMAGE,ratio:0.667`

---

## Debugging Tips

If something doesn't work:

1. **Check console for errors:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for red error messages
   - Share any errors found

2. **Verify hash is updating:**
   - Type in console: `window.location.hash`
   - Make a change to canvas
   - Type again - should see different hash
   - If same, hash sync isn't working

3. **Check localStorage:**
   - DevTools → Application → Storage → Local Storage → localhost:4200
   - After dropping an image, should see new entries

4. **Inspect selected item:**
   - Right-click canvas
   - Choose "Inspect"
   - Look for console output about selected item state

---

## Success Criteria

Feature is **WORKING** if:
- ✅ Can delete items with Backspace
- ✅ Images scale smoothly without distortion
- ✅ Hash updates on all interactions
- ✅ Hash can restore exact canvas state when copied/loaded

Feature is **BROKEN** if:
- ❌ Any of the above don't work
- ❌ Console shows JavaScript errors
- ❌ App crashes or becomes unresponsive
