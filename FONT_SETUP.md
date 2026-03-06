# SF Pro Font Setup Guide

The Instagram-style messages use **SF Pro** (San Francisco) font to match the authentic iOS Instagram look.

## Quick Setup

### Step 1: Download SF Pro Fonts

1. Go to https://developer.apple.com/fonts/
2. Click "Download" next to "SF Pro"
3. Extract the downloaded `.dmg` or `.zip` file
4. You'll find font files in the extracted folder

### Step 2: Copy Font Files

Copy these specific files to `remotion/public/fonts/`:

**Required files:**
- `SF-Pro-Text-Regular.otf`
- `SF-Pro-Text-Medium.otf`
- `SF-Pro-Text-Semibold.otf`
- `SF-Pro-Display-Regular.otf`
- `SF-Pro-Display-Medium.otf`
- `SF-Pro-Display-Semibold.otf`

You can do this via Finder or terminal:
```bash
# Navigate to where you extracted the SF Pro fonts
cd ~/Downloads/SF-Pro-Fonts  # adjust path as needed

# Copy to your project
cp SF-Pro-Text-Regular.otf /Users/yumelhernandez/UGC_Two_IG/remotion/public/fonts/
cp SF-Pro-Text-Medium.otf /Users/yumelhernandez/UGC_Two_IG/remotion/public/fonts/
cp SF-Pro-Text-Semibold.otf /Users/yumelhernandez/UGC_Two_IG/remotion/public/fonts/
cp SF-Pro-Display-Regular.otf /Users/yumelhernandez/UGC_Two_IG/remotion/public/fonts/
cp SF-Pro-Display-Medium.otf /Users/yumelhernandez/UGC_Two_IG/remotion/public/fonts/
cp SF-Pro-Display-Semibold.otf /Users/yumelhernandez/UGC_Two_IG/remotion/public/fonts/
```

### Step 3: Verify

Run the Remotion preview to verify fonts are loading:
```bash
cd remotion
npm start
```

Look in the browser console - you should NOT see any "Failed to load font" warnings.

## What's Already Configured

✅ [ChatBubble.tsx](remotion/src/components/ChatBubble.tsx) uses SF Pro fonts (line 4-5)
✅ [Root.tsx](remotion/src/Root.tsx) loads the fonts from `public/fonts/`
✅ Font fallbacks are configured: `"SF Pro Text", "SF Pro Display", -apple-system, "Helvetica Neue", "Avenir Next", sans-serif`

## Fallback Behavior

If SF Pro fonts aren't found, the system will fall back to:
1. `-apple-system` (native SF Pro on macOS/iOS)
2. `Helvetica Neue`
3. `Avenir Next`
4. Generic `sans-serif`

For production video rendering, having the actual font files is crucial for consistent output across different systems.

## File Structure

```
remotion/
  public/
    fonts/
      SF-Pro-Text-Regular.otf          ← Copy here
      SF-Pro-Text-Medium.otf           ← Copy here
      SF-Pro-Text-Semibold.otf         ← Copy here
      SF-Pro-Display-Regular.otf       ← Copy here
      SF-Pro-Display-Medium.otf        ← Copy here
      SF-Pro-Display-Semibold.otf      ← Copy here
      README.md                        (reference)
```
