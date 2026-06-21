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

// ─── REMOVE BACKGROUND ────────────────────────────────────────────
async function removeBackground(imageBuffer) {
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.REMOVEBG_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      image_file_b64: imageBuffer.toString('base64'),
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

// ─── STYLE CONFIGS ────────────────────────────────────────────────
const STYLES = {
  promo: {
    bg1: '#0d0015', bg2: '#2d0057', accent: '#7B61FF',
    spotlight: 'rgba(123,97,255,0.18)', floor: 'rgba(123,97,255,0.08)'
  },
  arrival: {
    bg1: '#000d1a', bg2: '#00234d', accent: '#0EA5E9',
    spotlight: 'rgba(14,165,233,0.15)', floor: 'rgba(14,165,233,0.07)'
  },
  minimal: {
    bg1: '#050505', bg2: '#181818', accent: '#FFFFFF',
    spotlight: 'rgba(255,255,255,0.10)', floor: 'rgba(255,255,255,0.05)'
  },
  story: {
    bg1: '#0d0600', bg2: '#2d1500', accent: '#F59E0B',
    spotlight: 'rgba(245,158,11,0.15)', floor: 'rgba(245,158,11,0.07)'
  }
}

// ─── PHOTOSHOOT STYLE IMAGE AD (1080x1080) ────────────────────────
export async function generateNormalImage({ imageUrl, headline, subtext, cta, price, currency, style }) {
  const W = 1080, H = 1080
  const jobId = uuidv4()
  const filename = `${jobId}.png`
  const outputPath = path.join(OUTPUT_DIR, filename)

  const cfg = STYLES[style] || STYLES.minimal

  console.log('Fetching product image...')
  const imgBuffer = await fetchImageBuffer(imageUrl)

  console.log('Removing background...')
  let productPng
  try {
    productPng = await removeBackground(imgBuffer)
    console.log('Background removed')
  } catch (err) {
    console.warn('Remove.bg failed, using original:', err.message)
    productPng = await sharp(imgBuffer).png().toBuffer()
  }

  // Product size — large, hero style
  const productW = Math.floor(W * 0.80)
  const productH = Math.floor(H * 0.58)
  const resizedProduct = await sharp(productPng)
    .resize(productW, productH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()

  const productLeft = Math.floor((W - productW) / 2)
  const productTop = Math.floor(H * 0.06)

  // ── Background SVG ──
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Deep dark bg gradient -->
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cfg.bg2}"/>
        <stop offset="100%" stop-color="${cfg.bg1}"/>
      </linearGradient>

      <!-- Dramatic spotlight behind product -->
      <radialGradient id="spot" cx="50%" cy="38%" r="42%">
        <stop offset="0%" stop-color="${cfg.spotlight}"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>

      <!-- Floor reflection gradient -->
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cfg.floor}"/>
        <stop offset="100%" stop-color="transparent"/>
      </linearGradient>

      <!-- Vignette -->
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="60%" stop-color="transparent"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
      </radialGradient>

      <!-- Bottom text area gradient -->
      <linearGradient id="textbg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="transparent"/>
        <stop offset="100%" stop-color="${cfg.bg1}"/>
      </linearGradient>
    </defs>

    <!-- Base background -->
    <rect width="${W}" height="${H}" fill="url(#bg)"/>

    <!-- Spotlight glow -->
    <rect width="${W}" height="${H}" fill="url(#spot)"/>

    <!-- Studio floor surface (bottom 30%) -->
    <rect x="0" y="${H * 0.68}" width="${W}" height="${H * 0.32}" fill="url(#floor)"/>

    <!-- Floor dividing line -->
    <line x1="0" y1="${H * 0.68}" x2="${W}" y2="${H * 0.68}" stroke="${cfg.accent}" stroke-width="0.5" stroke-opacity="0.25"/>

    <!-- Vignette edges -->
    <rect width="${W}" height="${H}" fill="url(#vignette)"/>

    <!-- Text area fade -->
    <rect x="0" y="${H * 0.62}" width="${W}" height="${H * 0.38}" fill="url(#textbg)" opacity="0.85"/>
  </svg>`

  // ── Product shadow/reflection ──
  const shadowSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sh" cx="50%" cy="20%" r="50%">
        <stop offset="0%" stop-color="rgba(0,0,0,0.5)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
    </defs>
    <!-- Hard shadow ellipse under product -->
    <ellipse cx="${W / 2}" cy="${productTop + productH + 18}" rx="${productW * 0.34}" ry="${productH * 0.04}" fill="rgba(0,0,0,0.45)"/>
    <!-- Soft glow shadow -->
    <ellipse cx="${W / 2}" cy="${productTop + productH + 22}" rx="${productW * 0.42}" ry="${productH * 0.07}" fill="url(#sh)"/>
  </svg>`

  // ── Text overlay ──
  const safeHeadline = escapeXml(truncate(headline, 28))
  const safeSubtext = escapeXml(truncate(subtext, 52))
  const safeCta = escapeXml(truncate(cta, 20))
  const safePrice = escapeXml(`${currency} ${price}`)

  const textY = productTop + productH + 60
  const subY = textY + 82
  const lineY = subY + 48
  const ctaY = H - 44

  const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Price badge — top right, pill shape -->
    <rect x="${W - 220}" y="32" width="188" height="60" rx="30" fill="${cfg.accent}" opacity="0.92"/>
    <text x="${W - 126}" y="72" font-family="Arial Black, Arial" font-size="27" font-weight="900" fill="white" text-anchor="middle">${safePrice}</text>

    <!-- Accent dot top left -->
    <circle cx="48" cy="52" r="6" fill="${cfg.accent}"/>

    <!-- Headline — large, bold, left aligned -->
    <text x="54" y="${textY}" font-family="Arial Black, Arial" font-size="66" font-weight="900" fill="white" letter-spacing="-1">${safeHeadline}</text>

    <!-- Accent line under headline -->
    <rect x="54" y="${textY + 14}" width="80" height="4" rx="2" fill="${cfg.accent}"/>

    <!-- Subtext -->
    <text x="54" y="${subY}" font-family="Arial, sans-serif" font-size="30" fill="rgba(255,255,255,0.72)" letter-spacing="0.5">${safeSubtext}</text>

    <!-- CTA button — bottom left, pill style -->
    <rect x="54" y="${lineY}" width="340" height="72" rx="36" fill="${cfg.accent}"/>
    <text x="224" y="${lineY + 47}" font-family="Arial Black, Arial" font-size="30" font-weight="900" fill="white" text-anchor="middle">${safeCta} →</text>

    <!-- Watermark bottom right -->
    <text x="${W - 24}" y="${H - 24}" font-family="Arial, sans-serif" font-size="15" fill="rgba(255,255,255,0.15)" text-anchor="end">ViralClip</text>
  </svg>`

  await sharp(Buffer.from(bgSvg))
    .composite([
      { input: Buffer.from(shadowSvg), top: 0, left: 0, blend: 'over' },
      { input: resizedProduct, top: productTop, left: productLeft, blend: 'over' },
      { input: Buffer.from(textSvg), top: 0, left: 0, blend: 'over' }
    ])
    .png()
    .toFile(outputPath)

  console.log('Photoshoot image generated:', filename)
  return { jobId, outputPath, filename }
}

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
