import sharp from 'sharp'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, '../outputs')
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

// Download image buffer from URL
async function fetchImageBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

// Escape XML special characters for SVG text
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Truncate text to max length
function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// ─── NORMAL IMAGE AD ───────────────────────────────────────────────
export async function generateNormalImage({ imageUrl, headline, subtext, cta, price, currency }) {
  const W = 1080, H = 1080
  const jobId = uuidv4()
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.png`)

  // Fetch and resize product image
  const imgBuffer = await fetchImageBuffer(imageUrl)
  const resized = await sharp(imgBuffer)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer()

  const safeHeadline = escapeXml(truncate(headline, 40))
  const safeSubtext = escapeXml(truncate(subtext, 60))
  const safeCta = escapeXml(truncate(cta, 20))
  const safePrice = escapeXml(`${currency} ${price}`)

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Dark gradient overlay bottom -->
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="55%" stop-color="#000000" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#grad)"/>

    <!-- Price badge top right -->
    <rect x="${W - 200}" y="40" width="160" height="56" rx="28" fill="#7B61FF"/>
    <text x="${W - 120}" y="76" font-family="Arial Black, Arial" font-size="26" font-weight="900" fill="white" text-anchor="middle">${safePrice}</text>

    <!-- Headline -->
    <text x="60" y="${H - 220}" font-family="Arial Black, Arial" font-size="62" font-weight="900" fill="white" text-anchor="start"
      style="filter: drop-shadow(0 2px 8px rgba(0,0,0,0.8))">${safeHeadline}</text>

    <!-- Subtext -->
    <text x="60" y="${H - 148}" font-family="Arial, sans-serif" font-size="34" fill="rgba(255,255,255,0.88)" text-anchor="start">${safeSubtext}</text>

    <!-- CTA bar -->
    <rect x="0" y="${H - 110}" width="${W}" height="110" fill="#7B61FF"/>
    <text x="${W / 2}" y="${H - 42}" font-family="Arial Black, Arial" font-size="38" font-weight="900" fill="white" text-anchor="middle">${safeCta} →</text>
  </svg>`

  await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath)

  return { jobId, outputPath, filename: `${jobId}.png` }
}

// ─── UGC STYLE IMAGE ───────────────────────────────────────────────
export async function generateUGCImage({ imageUrl, headline, caption, storeName }) {
  const W = 1080, H = 1920 // TikTok/Reels vertical format
  const jobId = uuidv4()
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.png`)

  // Fetch and resize product image for phone screen area
  const imgBuffer = await fetchImageBuffer(imageUrl)
  const phoneImgW = 880
  const phoneImgH = 1100
  const phoneImg = await sharp(imgBuffer)
    .resize(phoneImgW, phoneImgH, { fit: 'cover', position: 'centre' })
    .toBuffer()

  const safeHeadline = escapeXml(truncate(headline, 50))
  const safeCaption = escapeXml(truncate(caption, 80))
  const safeStore = escapeXml(storeName || 'Shop Now')

  // Background
  const bg = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 15, g: 15, b: 20, alpha: 1 } }
  }).png().toBuffer()

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Phone frame -->
    <rect x="100" y="120" width="880" height="1300" rx="60" fill="#1a1a2e" stroke="#333" stroke-width="3"/>
    
    <!-- Phone notch -->
    <rect x="380" y="132" width="120" height="24" rx="12" fill="#111"/>

    <!-- Image area inside phone (composited separately) -->
    <rect x="100" y="160" width="880" height="1100" fill="#222"/>

    <!-- Image overlay gradient -->
    <defs>
      <linearGradient id="phoneGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect x="100" y="160" width="880" height="1100" fill="url(#phoneGrad)"/>

    <!-- POV text top of phone -->
    <text x="140" y="230" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">POV: You found the perfect product 👀</text>

    <!-- Headline over image bottom -->
    <text x="140" y="${160 + 1100 - 80}" font-family="Arial Black, Arial" font-size="44" font-weight="900" fill="white">${safeHeadline}</text>

    <!-- TikTok-style right sidebar icons -->
    <text x="940" y="700" font-size="40" text-anchor="middle" fill="white">❤️</text>
    <text x="940" y="760" font-size="22" text-anchor="middle" fill="white">24k</text>
    <text x="940" y="820" font-size="40" text-anchor="middle" fill="white">💬</text>
    <text x="940" y="880" font-size="40" text-anchor="middle" fill="white">↗️</text>

    <!-- Bottom bar username + caption -->
    <rect x="100" y="1260" width="880" height="160" rx="0" fill="#111122"/>
    <text x="140" y="1305" font-family="Arial Black, Arial" font-size="28" font-weight="900" fill="white">@${safeStore}</text>
    <text x="140" y="1345" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)">${safeCaption}</text>
    <text x="140" y="1385" font-family="Arial, sans-serif" font-size="22" fill="#7B61FF">#viral #musthave #trending</text>

    <!-- Bottom phone bar -->
    <rect x="100" y="1420" width="880" height="200" rx="0" fill="#111"/>
    <rect x="440" y="1560" width="200" height="8" rx="4" fill="rgba(255,255,255,0.3)"/>

    <!-- Watermark -->
    <text x="${W / 2}" y="${H - 30}" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.3)" text-anchor="middle">Made with ViralClip</text>
  </svg>`

  await sharp(bg)
    .composite([
      { input: phoneImg, top: 160, left: 100 },
      { input: Buffer.from(svg), top: 0, left: 0 }
    ])
    .png()
    .toFile(outputPath)

  return { jobId, outputPath, filename: `${jobId}.png` }
}
