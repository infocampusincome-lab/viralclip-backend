import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMP_DIR = path.join(__dirname, '../temp')
const OUTPUT_DIR = path.join(__dirname, '../outputs')

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

// Platform dimensions
const PLATFORMS = {
  tiktok:    { width: 1080, height: 1920, label: 'TikTok / Reels' },
  instagram: { width: 1080, height: 1080, label: 'Instagram Feed' },
  facebook:  { width: 1280, height: 720,  label: 'Facebook / YouTube' }
}

// Style configs — duration per image, transition style
const STYLES = {
  promo:   { duration: 2.5, effect: 'zoompan', colorBar: '#FF4444' },
  arrival: { duration: 3,   effect: 'zoompan', colorBar: '#7B61FF' },
  minimal: { duration: 3.5, effect: 'zoompan', colorBar: '#111111' },
  story:   { duration: 4,   effect: 'zoompan', colorBar: '#F4A261' }
}

// Download image from URL to local temp file
async function downloadImage(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download image: ${url}`)
  const buffer = await res.buffer()
  fs.writeFileSync(destPath, buffer)
}

// Build FFmpeg zoompan filter for Ken Burns effect
function buildZoompanFilter(width, height, duration, index) {
  const fps = 25
  const frames = Math.floor(duration * fps)
  // Alternate zoom direction per image for variety
  const zoomDir = index % 2 === 0 ? '+0.001' : '-0.001'
  const startZoom = index % 2 === 0 ? '1.0' : '1.05'
  return `zoompan=z='${startZoom}${zoomDir}*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height},fps=${fps}`
}

// Generate text overlay filter (headline + subtext + cta bar)
function buildTextFilter(headline, subtext, cta, width, height, colorBar, totalDuration) {
  const safeHeadline = headline.replace(/'/g, "\\'").replace(/:/g, "\\:")
  const safeSubtext = subtext.replace(/'/g, "\\'").replace(/:/g, "\\:")
  const safeCta = cta.replace(/'/g, "\\'").replace(/:/g, "\\:")

  const fontSize = width > 900 ? 64 : 48
  const subFontSize = Math.floor(fontSize * 0.55)
  const ctaFontSize = Math.floor(fontSize * 0.5)
  const padding = 60
  const barHeight = Math.floor(height * 0.15)
  const barY = height - barHeight

  return [
    // Dark gradient overlay at bottom
    `drawbox=x=0:y=${barY}:w=${width}:h=${barHeight}:color=${colorBar}@0.88:t=fill`,
    // Headline text — centered top area
    `drawtext=text='${safeHeadline}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${Math.floor(height * 0.35)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:shadowx=3:shadowy=3:shadowcolor=black@0.6`,
    // Subtext
    `drawtext=text='${safeSubtext}':fontsize=${subFontSize}:fontcolor=white@0.9:x=(w-text_w)/2:y=${Math.floor(height * 0.35) + fontSize + 16}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:shadowx=2:shadowy=2:shadowcolor=black@0.5`,
    // CTA in color bar
    `drawtext=text='${safeCta}':fontsize=${ctaFontSize}:fontcolor=white:x=(w-text_w)/2:y=${barY + Math.floor(barHeight / 2) - Math.floor(ctaFontSize / 2)}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`
  ].join(',')
}

export async function generateVideo({
  images,          // array of image URLs (from Shopify)
  headline,
  subtext,
  cta,
  style = 'promo',
  platform = 'tiktok',
  musicMood = 'none'
}) {
  const jobId = uuidv4()
  const jobDir = path.join(TEMP_DIR, jobId)
  fs.mkdirSync(jobDir, { recursive: true })

  const { width, height } = PLATFORMS[platform] || PLATFORMS.tiktok
  const { duration, effect, colorBar } = STYLES[style] || STYLES.promo

  // Limit to 3 images max for performance
  const imageUrls = images.slice(0, 3)
  if (imageUrls.length === 0) throw new Error('No images provided')

  // Download all product images
  const localImages = []
  for (let i = 0; i < imageUrls.length; i++) {
    const localPath = path.join(jobDir, `img_${i}.jpg`)
    await downloadImage(imageUrls[i], localPath)
    localImages.push(localPath)
  }

  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`)
  const totalDuration = duration * localImages.length
  const textFilter = buildTextFilter(headline, subtext, cta, width, height, colorBar, totalDuration)

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()

    // Add each image as input with duration
    localImages.forEach(imgPath => {
      cmd = cmd.input(imgPath).inputOptions([`-loop 1`, `-t ${duration}`])
    })

    // Build filter complex
    const filterParts = []
    const streamLabels = []

    localImages.forEach((_, i) => {
      const zoomFilter = buildZoompanFilter(width, height, duration, i)
      filterParts.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,${zoomFilter}[v${i}]`)
      streamLabels.push(`[v${i}]`)
    })

    // Concat all image streams
    filterParts.push(`${streamLabels.join('')}concat=n=${localImages.length}:v=1:a=0[vconcat]`)
    // Add text overlays
    filterParts.push(`[vconcat]${textFilter}[vout]`)

    cmd
      .complexFilter(filterParts.join(';'))
      .outputOptions([
        '-map [vout]',
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        `-t ${totalDuration}`
      ])
      .output(outputPath)
      .on('start', cmdLine => console.log('FFmpeg started:', cmdLine.slice(0, 100)))
      .on('progress', p => console.log(`FFmpeg progress: ${Math.round(p.percent || 0)}%`))
      .on('end', () => {
        // Cleanup temp images
        fs.rmSync(jobDir, { recursive: true, force: true })
        resolve({ jobId, outputPath, filename: `${jobId}.mp4` })
      })
      .on('error', (err) => {
        fs.rmSync(jobDir, { recursive: true, force: true })
        console.error('FFmpeg error:', err.message)
        reject(err)
      })
      .run()
  })
}

// Clean up output file after download
export function cleanupVideo(filename) {
  const filePath = path.join(OUTPUT_DIR, filename)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}
