import sharp from 'sharp'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, '../outputs')
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

async function fetchImageBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// ─── NORMAL IMAGE AD (1080x1080) ───────────────────────────────────
export async function generateNormalImage({ imageUrl, headline, subtext, cta, price, currency }) {
  const W = 1080, H = 1080
  const jobId = uuidv4()
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.png`)

  const imgBuffer = await fetchImageBuffer(imageUrl)
  const resized = await sharp(imgBuffer)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer()

  const safeHeadline = escapeXml(truncate(headline, 40))
  const safeSubtext = escapeXml(truncate(subtext, 60))
  const safeCta = escapeXml(truncate(cta, 20))
  const safePrice = escapeXml(`${currency} ${price}`)

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="50%" stop-color="#000000" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.93"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#grad)"/>

    <!-- Price badge -->
    <rect x="${W - 210}" y="36" width="174" height="58" rx="29" fill="#7B61FF"/>
    <text x="${W - 123}" y="74" font-family="Arial Black, Arial" font-size="26" font-weight="900" fill="white" text-anchor="middle">${safePrice}</text>

    <!-- Headline -->
    <text x="56" y="${H - 226}" font-family="Arial Black, Arial" font-size="60" font-weight="900" fill="white">${safeHeadline}</text>

    <!-- Subtext -->
    <text x="56" y="${H - 154}" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.88)">${safeSubtext}</text>

    <!-- CTA bar -->
    <rect x="0" y="${H - 112}" width="${W}" height="112" fill="#7B61FF"/>
    <text x="${W / 2}" y="${H - 40}" font-family="Arial Black, Arial" font-size="38" font-weight="900" fill="white" text-anchor="middle">${safeCta} →</text>

    <!-- Watermark -->
    <text x="${W - 20}" y="${H - 124}" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.25)" text-anchor="end">ViralClip</text>
  </svg>`

  await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath)

  return { jobId, outputPath, filename: `${jobId}.png` }
}

// ─── UGC STYLE IMAGE (1080x1920 vertical) ──────────────────────────
export async function generateUGCImage({ imageUrl, headline, caption, storeName }) {
  const W = 1080, H = 1920
  const jobId = uuidv4()
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.png`)

  const PHONE_LEFT = 100
  const PHONE_TOP = 120
  const PHONE_W = 880
  const PHONE_H = 1300
  const IMG_TOP = 168
  const IMG_H = 1050

  // Fetch and resize product image to fit inside phone screen
  const imgBuffer = await fetchImageBuffer(imageUrl)
  const phoneImg = await sharp(imgBuffer)
    .resize(PHONE_W, IMG_H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  // Dark background
  const bg = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 12, g: 12, b: 18, alpha: 1 } }
  }).png().toBuffer()

  const safeHeadline = escapeXml(truncate(headline, 45))
  const safeCaption = escapeXml(truncate(caption, 75))
  const safeStore = escapeXml(truncate(storeName || 'yourstore', 24))

  // SVG layer — drawn ON TOP of the product image
  // Key fix: NO solid rect covering the image area — only the phone frame border and overlays
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="imgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
      </linearGradient>
      <clipPath id="phoneClip">
        <rect x="${PHONE_LEFT}" y="${PHONE_TOP}" width="${PHONE_W}" height="${PHONE_H}" rx="56"/>
      </clipPath>
    </defs>

    <!-- Phone outer frame -->
    <rect x="${PHONE_LEFT}" y="${PHONE_TOP}" width="${PHONE_W}" height="${PHONE_H}" rx="56" fill="none" stroke="#444" stroke-width="6"/>

    <!-- Gradient over image bottom half only -->
    <rect x="${PHONE_LEFT}" y="${IMG_TOP}" width="${PHONE_W}" height="${IMG_H}" fill="url(#imgGrad)" clip-path="url(#phoneClip)"/>

    <!-- Phone notch -->
    <rect x="390" y="134" width="100" height="22" rx="11" fill="#1a1a1a"/>

    <!-- POV caption top of screen -->
    <text x="140" y="222" font-family="Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.85)">POV: You found the perfect product 👀</text>

    <!-- Headline at bottom of image -->
    <text x="136" y="${IMG_TOP + IMG_H - 70}" font-family="Arial Black, Arial" font-size="46" font-weight="900" fill="white">${safeHeadline}</text>

    <!-- TikTok right sidebar -->
    <text x="952" y="660" font-size="42" text-anchor="middle" fill="white">❤️</text>
    <text x="952" y="714" font-size="21" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" fill="white">24k</text>
    <text x="952" y="784" font-size="42" text-anchor="middle" fill="white">💬</text>
    <text x="952" y="854" font-size="42" text-anchor="middle" fill="white">↗️</text>
    <text x="952" y="924" font-size="42" text-anchor="middle" fill="white">🔖</text>

    <!-- Bottom info bar inside phone -->
    <rect x="${PHONE_LEFT}" y="${IMG_TOP + IMG_H}" width="${PHONE_W}" height="182" fill="#0e0e18"/>
    <text x="140" y="${IMG_TOP + IMG_H + 44}" font-family="Arial Black, Arial" font-size="28" font-weight="900" fill="white">@${safeStore}</text>
    <text x="140" y="${IMG_TOP + IMG_H + 82}" font-family="Arial, sans-serif" font-size="23" fill="rgba(255,255,255,0.82)">${safeCaption}</text>
    <text x="140" y="${IMG_TOP + IMG_H + 118}" font-family="Arial, sans-serif" font-size="22" fill="#7B61FF">#viral #musthave #trending</text>

    <!-- Phone bottom bar -->
    <rect x="${PHONE_LEFT}" y="${IMG_TOP + IMG_H + 182}" width="${PHONE_W}" height="${PHONE_H - IMG_H - 182 + PHONE_TOP - PHONE_TOP}" fill="#080810" rx="0"/>
    <rect x="440" y="1548" width="200" height="7" rx="4" fill="rgba(255,255,255,0.25)"/>

    <!-- Watermark below phone -->
    <text x="${W / 2}" y="${H - 28}" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.22)" text-anchor="middle">Made with ViralClip</text>
  </svg>`

  await sharp(bg)
    .composite([
      // 1. Product image inside phone screen area
      { input: phoneImg, top: IMG_TOP, left: PHONE_LEFT, blend: 'over' },
      // 2. SVG overlays (frame, gradient, text) on top
      { input: Buffer.from(svg), top: 0, left: 0, blend: 'over' }
    ])
    .png()
    .toFile(outputPath)

  return { jobId, outputPath, filename: `${jobId}.png` }
}
