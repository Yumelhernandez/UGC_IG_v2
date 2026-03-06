# Image Download Script

This script downloads 100 royalty-free images of women from Pexels across various lifestyle categories for the baddies folder.

## Categories (100 images total)
- **Selfie** (20 images) - Portrait selfies
- **Mirror** (15 images) - Mirror selfies, outfit shots
- **Travel** (15 images) - Beach, vacation, travel
- **Nightlife** (12 images) - Party, club, going out
- **Food** (10 images) - Eating, restaurants, brunch
- **Fitness** (8 images) - Gym, workout, fitness
- **Beach** (10 images) - Beach, bikini, summer
- **Casual** (10 images) - Coffee, lifestyle, everyday

## Setup

1. **Get a free Pexels API key:**
   - Go to https://www.pexels.com/api/
   - Sign up for a free account
   - Copy your API key

2. **Set the environment variable:**
   ```bash
   export PEXELS_API_KEY="your-api-key-here"
   ```

3. **Run the script:**
   ```bash
   cd /Users/yumelhernandez/UGC_Two_IG
   node scripts/download-images.js
   ```

## Output

- Images will be saved to: `baddies/`
- Images are named: `story-001.jpg`, `story-002.jpg`, etc.
- A `manifest.json` file is created with metadata about each image
- Images are downloaded in portrait orientation at 940px width (large size)

## License

All images are from Pexels and are free to use under the Pexels License:
- Free for personal and commercial use
- No attribution required (but appreciated)
- You can modify the images

See: https://www.pexels.com/license/

## Note

The script includes small delays between downloads to be respectful to the Pexels API rate limits.
