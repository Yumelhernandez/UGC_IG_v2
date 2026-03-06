const https = require('https');
const fs = require('fs');
const path = require('path');

// Get API key from environment variable
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (!PEXELS_API_KEY) {
  console.error('❌ Error: PEXELS_API_KEY environment variable not set');
  console.error('Get your free API key at: https://www.pexels.com/api/');
  console.error('Then run: export PEXELS_API_KEY="your-key-here"');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '../baddies');

// Categories with search queries and how many images per category
const CATEGORIES = [
  { name: 'selfie', query: 'woman selfie portrait', count: 20 },
  { name: 'mirror', query: 'woman mirror selfie outfit', count: 15 },
  { name: 'travel', query: 'woman travel vacation beach', count: 15 },
  { name: 'nightlife', query: 'woman nightlife club party dress', count: 12 },
  { name: 'food', query: 'woman eating restaurant brunch', count: 10 },
  { name: 'fitness', query: 'woman fitness gym workout', count: 8 },
  { name: 'beach', query: 'woman beach bikini summer', count: 10 },
  { name: 'casual', query: 'woman casual lifestyle coffee', count: 10 }
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper function to make API requests
function makeRequest(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`API returned status ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// Helper function to download an image
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      } else {
        reject(new Error(`Failed to download: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Main function to download images
async function downloadImages() {
  console.log('🚀 Starting image download from Pexels...\n');

  let imageCounter = 1;
  const manifest = [];

  for (const category of CATEGORIES) {
    console.log(`📂 Downloading ${category.count} images for category: ${category.name}`);

    try {
      // Search for images in this category
      const searchUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(category.query)}&per_page=${category.count}&orientation=portrait`;
      const data = await makeRequest(searchUrl, {
        'Authorization': PEXELS_API_KEY
      });

      if (!data.photos || data.photos.length === 0) {
        console.log(`  ⚠️  No photos found for ${category.name}`);
        continue;
      }

      // Download each image
      for (let i = 0; i < Math.min(category.count, data.photos.length); i++) {
        const photo = data.photos[i];
        const filename = `story-${String(imageCounter).padStart(3, '0')}.jpg`;
        const filepath = path.join(OUTPUT_DIR, filename);

        try {
          // Use 'large' size for good quality (width: 940px)
          await downloadImage(photo.src.large, filepath);

          manifest.push({
            filename,
            category: category.name,
            photographer: photo.photographer,
            photographer_url: photo.photographer_url,
            pexels_url: photo.url,
            width: photo.width,
            height: photo.height
          });

          console.log(`  ✓ Downloaded ${filename} (${category.name})`);
          imageCounter++;

          // Small delay to be respectful to the API
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`  ✗ Failed to download image ${imageCounter}: ${err.message}`);
        }
      }

      // Longer delay between categories
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`  ✗ Failed to fetch ${category.name}: ${err.message}`);
    }
  }

  // Save manifest file
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Downloaded ${imageCounter - 1} images`);
  console.log(`📝 Manifest saved to: ${manifestPath}`);
  console.log(`\n⚠️  Remember to credit photographers as per Pexels license!`);
}

// Run the script
downloadImages().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
