# SF Pro Font Installation

To use SF Pro fonts in your videos, you need to download and place the font files here.

## Option 1: Download from Apple (Recommended)

1. Visit https://developer.apple.com/fonts/
2. Download "SF Pro" font package
3. Extract the downloaded package
4. Copy these files to this directory:
   - `SF-Pro-Text-Regular.otf` (or .ttf)
   - `SF-Pro-Text-Medium.otf`
   - `SF-Pro-Text-Semibold.otf`
   - `SF-Pro-Display-Regular.otf`
   - `SF-Pro-Display-Medium.otf`
   - `SF-Pro-Display-Semibold.otf`

## Option 2: Use System Fonts (macOS only)

If you're on macOS, you can copy from your system:

```bash
# Copy SF Pro fonts from system
cp /System/Library/Fonts/SFPro*.ttf ./
# or from user fonts
cp ~/Library/Fonts/SF-Pro*.otf ./
```

## Required Files

At minimum, you need:
- SF-Pro-Text-Regular (for message text)
- SF-Pro-Display-Regular (for larger text)

The component will fall back to system fonts if these aren't available, but for consistent video rendering, having the actual font files is important.
