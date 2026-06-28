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

const STYLES = {
  promo:   { bg1: '#0d0015', bg2: '#2d0057', accent: '#7B61FF' },
  arrival: { bg1: '#000d1a', bg2: '#00234d', accent: '#0EA5E9' },
  minimal: { bg1: '#050505', bg2: '#181818', accent: '#FFFFFF' },
  story:   { bg1: '#0d0600', bg2: '#2d1500', accent: '#F59E0B' }
}

export async function generateNormalImage({ imageUrl, headline, subtext, cta, price, currency, style }) {
  const W = 1080, H = 1080
  const jobId = uuidv4()
  const filename = `${jobId}.png`
  const outputPath = path.join(OUTPUT_DIR, filename)

  const cfg = STYLES[style] || STYLES.promo
  console.log('Style:', style, 'Config:', cfg)

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

  const productW = Math.floor(W * 0.78)
  const productH = Math.floor(H * 0.56)
  const resizedProduct = await sharp(productPng)
    .resize(productW, productH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const productLeft = Math.floor((W - productW) / 2)
  const productTop = Math.floor(H * 0.05)

  // Build background using sharp directly — more reliable than SVG gradients
  const bgBuffer = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 13, g: 0, b: 21 } }
  }).png().toBuffer()

  const safeHeadline = escapeXml(truncate(headline || 'Shop Now', 28))
  const safeSubtext = escapeXml(truncate(subtext || '', 52))
  const safeCta = escapeXml(truncate(cta || 'Shop Now', 20))
  const safePrice = price ? escapeXml(`${currency} ${price}`) : ''

  const textY = productTop + productH + 55
  const subY = textY + 78
  const lineY = subY + 44

  // Parse accent color to rgb for backgrounds
  const accentHex = cfg.accent.replace('#', '')
  const ar = parseInt(accentHex.slice(0,2), 16)
  const ag = parseInt(accentHex.slice(2,4), 16)
  const ab = parseInt(accentHex.slice(4,6), 16)

  // Gradient background SVG — using rgba(0,0,0,0) instead of 'transparent'
  const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cfg.bg2}"/>
        <stop offset="100%" stop-color="${cfg.bg1}"/>
      </linearGradient>
      <radialGradient id="spot" cx="50%" cy="35%" r="45%">
        <stop offset="0%" stop-color="rgba(${ar},${ag},${ab},0.2)"/>
        <stop offset="100%" stop-color="rgba(${ar},${ag},${ab},0)"/>
      </radialGradient>
      <radialGradient id="vign" cx="50%" cy="50%" r="70%">
        <stop offset="55%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.6)"/>
      </radialGradient>
      <linearGradient id="textfade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="${cfg.bg1}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#spot)"/>
    <rect width="${W}" height="${H}" fill="url(#vign)"/>
    <rect x="0" y="${H * 0.60}" width="${W}" height="${H * 0.40}" fill="url(#textfade)" opacity="0.9"/>
    <line x1="0" y1="${H * 0.68}" x2="${W}" y2="${H * 0.68}" stroke="${cfg.accent}" stroke-width="1" stroke-opacity="0.2"/>
  </svg>`

  const shadowSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${W/2}" cy="${productTop + productH + 16}" rx="${productW * 0.32}" ry="${productH * 0.038}" fill="rgba(0,0,0,0.5)"/>
    <ellipse cx="${W/2}" cy="${productTop + productH + 24}" rx="${productW * 0.40}" ry="${productH * 0.065}" fill="rgba(0,0,0,0.2)"/>
  </svg>`

  const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${safePrice ? `
    <rect x="${W-218}" y="30" width="186" height="58" rx="29" fill="${cfg.accent}" opacity="0.95"/>
    <text x="${W-125}" y="70" font-family="Arial Black,Arial" font-size="26" font-weight="900" fill="white" text-anchor="middle">${safePrice}</text>
    ` : ''}
    <circle cx="46" cy="50" r="5" fill="${cfg.accent}"/>
    <text x="54" y="${textY}" font-family="Arial Black,Arial" font-size="64" font-weight="900" fill="white">${safeHeadline}</text>
    <rect x="54" y="${textY + 12}" width="72" height="4" rx="2" fill="${cfg.accent}"/>
    ${safeSubtext ? `<text x="54" y="${subY}" font-family="Arial,sans-serif" font-size="30" fill="rgba(255,255,255,0.75)">${safeSubtext}</text>` : ''}
    <rect x="54" y="${lineY}" width="320" height="70" rx="35" fill="${cfg.accent}"/>
    <text x="214" y="${lineY + 46}" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="white" text-anchor="middle">${safeCta} →</text>
    <text x="${W-20}" y="${H-20}" font-family="Arial,sans-serif" font-size="14" fill="rgba(255,255,255,0.12)" text-anchor="end">MeshClip</text>
  </svg>`

  await sharp(Buffer.from(bgSvg))
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
