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

// ─── REMOVE BACKGROUND via Remove.bg API ──────────────────────────
async function removeBackground(imageBuffer) {
  const formData = new URLSearchParams()
  
  // Use base64 approach — no FormData needed
  const base64 = imageBuffer.toString('base64')
  
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.REMOVEBG_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      image_file_b64: base64,
      size: 'auto',
      format: 'png'
    }).toString()
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Remove.bg error:', err)
    throw new Error(`Remove.bg failed: ${res.status}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

// ─── BUILD STUDIO BACKGROUND ──────────────────────────────────────
async function buildStudioBackground(W, H, style) {
  const backgrounds = {
    promo:   { inner: '#4a0080', outer: '#1a0533' },
    arrival: { inner: '#0353a4', outer: '#001233' },
    minimal: { inner: '#2d2d2d', outer: '#111111' },
    story:   { inner: '#7c3a00', outer: '#1a0a00' }
  }

  const bg = backgrounds[style] || backgrounds.minimal

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stop-color="${bg.inner}"/>
        <stop offset="100%" stop-color="${bg.outer}"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <ellipse cx="${W / 2}" cy="${H * 0.42}" rx="${W * 0.38}" ry="${H * 0.22}" fill="rgba(255,255,255,0.04)"/>
  </svg>`

  return sharp(Buffer.from(svg)).png().toBuffer()
}

// ─── NORMAL IMAGE AD (1080x1080) ──────────────────────────────────
export async function generateNormalImage({ imageUrl, headline, subtext, cta, price, currency, style }) {
  const W = 1080, H = 1080
  const jobId = uuidv4()
  const filename = `${jobId}.png`
  const outputPath = path.join(OUTPUT_DIR, filename)

  console.log('Fetching product image...')
  const imgBuffer = await fetchImageBuffer(imageUrl)

  // Remove background
  console.log('Removing background via Remove.bg...')
  let productPng
  try {
    productPng = await removeBackground(imgBuffer)
    console.log('Background removed successfully')
  } catch (err) {
    console.warn('Background removal failed, using original:', err.message)
    productPng = await sharp(imgBuffer).png().toBuffer()
  }

  // Resize product — centered, leaving room for text at bottom
  const productSize = Math.floor(W * 0.72)
  const resizedProduct = await sharp(productPng)
    .resize(productSize, productSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()

  const productLeft = Math.floor((W - productSize) / 2)
  const productTop = Math.floor(H * 0.05)

  // Build studio background
  const bgBuffer = await buildStudioBackground(W, H, style)

  const safeHeadline = escapeXml(truncate(headline, 38))
  const safeSubtext = escapeXml(truncate(subtext, 55))
  const safeCta = escapeXml(truncate(cta, 20))
  const safePrice = escapeXml(`${currency} ${price}`)

  // Drop shadow under product
  const shadowSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sh" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="${W / 2}" cy="${productTop + productSize + 10}" rx="${productSize * 0.36}" ry="${productSize * 0.055}" fill="url(#sh)"/>
  </svg>`

  // Text + UI overlay
  const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Price badge -->
    <rect x="${W - 210}" y="36" width="174" height="58" rx="29" fill="#7B61FF"/>
    <text x="${W - 123}" y="75" font-family="Arial Black, Arial" font-size="26" font-weight="900" fill="white" text-anchor="middle">${safePrice}</text>

    <!-- Headline -->
    <text x="54" y="${H - 228}" font-family="Arial Black, Arial" font-size="56" font-weight="900" fill="white">${safeHeadline}</text>

    <!-- Subtext -->
    <text x="54" y="${H - 160}" font-family="Arial, sans-serif" font-size="30" fill="rgba(255,255,255,0.80)">${safeSubtext}</text>

    <!-- CTA bar -->
    <rect x="0" y="${H - 112}" width="${W}" height="112" fill="#7B61FF"/>
    <text x="${W / 2}" y="${H - 38}" font-family="Arial Black, Arial" font-size="38" font-weight="900" fill="white" text-anchor="middle">${safeCta} →</text>

    <!-- Watermark -->
    <text x="${W - 18}" y="${H - 122}" font-family="Arial, sans-serif" font-size="15" fill="rgba(255,255,255,0.18)" text-anchor="end">ViralClip</text>
  </svg>`

  await sharp(bgBuffer)
    .composite([
      { input: Buffer.from(shadowSvg), top: 0, left: 0, blend: 'over' },
      { input: resizedProduct, top: productTop, left: productLeft, blend: 'over' },
      { input: Buffer.from(textSvg), top: 0, left: 0, blend: 'over' }
    ])
    .png()
    .toFile(outputPath)

  console.log('Image generated:', filename)
  return { jobId, outputPath, filename }
}

// Keep UGC as placeholder for future
export async function generateUGCImage({ imageUrl, headline, caption, storeName }) {
  return generateNormalImage({
    imageUrl, headline,
    subtext: caption,
    cta: 'Shop Now',
    price: '',
    currency: '',
    style: 'minimal'
  })
}
