import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUTS_DIR = path.join(__dirname, '../outputs')
const TEMP_DIR = path.join(__dirname, '../temp')

// Ensure directories exist
if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true })
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

// Format dimensions
const FORMAT_SIZES = {
  '9:16': { width: 1080, height: 1920 },
  '1:1':  { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
}

// Download an image to a local temp file
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    protocol.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${res.statusCode} ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve(destPath) })
    }).on('error', err => {
      fs.unlink(destPath, () => {})
      reject(err)
    })
  })
}

// Wrap text for SVG display
function wrapText(text, maxChars = 22) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current.trim())
  return lines
}

// Generate SVG overlay for text
function generateTextOverlaySVG(width, height, headline, subtext, cta) {
  const headlineLines = wrapText(headline || '', 20)
  const subtextLines = wrapText(subtext || '', 28)

  const headlineFontSize = Math.round(width * 0.062)
  const subtextFontSize = Math.round(width * 0.036)
  const ctaFontSize = Math.round(width * 0.038)
  const lineHeight = headlineFontSize * 1.25
  const subtextLineHeight = subtextFontSize * 1.4

  const headlineBlockHeight = headlineLines.length * lineHeight
  const subtextBlockHeight = subtextLines.length * subtextLineHeight
  const ctaHeight = ctaFontSize * 2.4
  const padding = Math.round(width * 0.055)
  const gap = Math.round(height * 0.018)

  const totalTextHeight = headlineBlockHeight + gap + subtextBlockHeight + gap + ctaHeight
  const startY = height * 0.62

  let headlineY = startY
  let subtextY = headlineY + headlineBlockHeight + gap
  let ctaY = subtextY + subtextBlockHeight + gap

  const headlineSVG = headlineLines.map((line, i) =>
    `<text x="${width / 2}" y="${headlineY + i * lineHeight}" 
      font-family="Arial Black, sans-serif" font-size="${headlineFontSize}" 
      font-weight="900" fill="white" text-anchor="middle"
      filter="url(#shadow)">${line}</text>`
  ).join('\n')

  const subtextSVG = subtextLines.map((line, i) =>
    `<text x="${width / 2}" y="${subtextY + i * subtextLineHeight}"
      font-family="Arial, sans-serif" font-size="${subtextFontSize}"
      fill="rgba(255,255,255,0.88)" text-anchor="middle"
      filter="url(#shadow)">${line}</text>`
  ).join('\n')

  const ctaBtnY = ctaY - ctaFontSize * 0.3
  const ctaBtnWidth = Math.round(width * 0.44)
  const ctaBtnHeight = Math.round(ctaFontSize * 2.2)
  const ctaBtnX = (width - ctaBtnWidth) / 2

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.7)" />
    </filter>
    <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.72)" />
    </linearGradient>
  </defs>

  <!-- Bottom gradient overlay -->
  <rect x="0" y="${height * 0.45}" width="${width}" height="${height * 0.55}" fill="url(#bottomGrad)" />

  <!-- Headline -->
  ${headlineSVG}

  <!-- Subtext -->
  ${subtextSVG}

  <!-- CTA button -->
  <rect x="${ctaBtnX}" y="${ctaBtnY}" width="${ctaBtnWidth}" height="${ctaBtnHeight}" 
    rx="${ctaBtnHeight / 2}" fill="#7B61FF" />
  <text x="${width / 2}" y="${ctaBtnY + ctaBtnHeight * 0.64}"
    font-family="Arial, sans-serif" font-size="${ctaFontSize}"
    font-weight="700" fill="white" text-anchor="middle">${cta || 'Shop Now'}</text>
</svg>`
}

export async function generateVideoSlideshow({ images, transition, duration, format, headline, subtext, cta, productTitle }) {
  const jobId = uuidv4()
  const { width, height } = FORMAT_SIZES[format] || FORMAT_SIZES['9:16']
  const outputFilename = `${jobId}.mp4`
  const outputPath = path.join(OUTPUTS_DIR, outputFilename)

  // Download all images to temp dir
  const localImages = []
  for (let i = 0; i < images.length; i++) {
    const tempPath = path.join(TEMP_DIR, `${jobId}_img${i}.jpg`)
    try {
      await downloadImage(images[i], tempPath)
      localImages.push(tempPath)
    } catch (err) {
      console.error(`Failed to download image ${i}:`, err.message)
    }
  }

  if (localImages.length < 2) {
    throw new Error('Not enough images could be downloaded')
  }

  // Generate SVG text overlay
  const svgContent = generateTextOverlaySVG(width, height, headline, subtext, cta)
  const svgPath = path.join(TEMP_DIR, `${jobId}_overlay.svg`)
  fs.writeFileSync(svgPath, svgContent)

  // Build FFmpeg filter complex for slideshow with transitions
  const imgDuration = duration || 4
  const fadeDuration = 0.5
  const numImages = localImages.length

  await new Promise((resolve, reject) => {
    const cmd = ffmpeg()

    // Add each image as input
    localImages.forEach(imgPath => {
      cmd.input(imgPath)
        .inputOptions([
          `-loop 1`,
          `-t ${imgDuration + fadeDuration}`
        ])
    })

    // Add SVG overlay as input
    cmd.input(svgPath)
      .inputOptions([`-loop 1`, `-t ${numImages * imgDuration}`])

    // Build filter complex
    let filterComplex = ''
    const scaledLabels = []

    // Scale and pad each image to target size
    for (let i = 0; i < numImages; i++) {
      filterComplex += `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30[img${i}];`
      scaledLabels.push(`[img${i}]`)
    }

    // Apply transitions based on type
    if (transition === 'fade' || transition === 'kenburns') {
      // Crossfade between images
      let prev = `img0`
      for (let i = 1; i < numImages; i++) {
        const offset = i * imgDuration - fadeDuration
        const next = i < numImages - 1 ? `xfade${i}` : `xfaded`
        filterComplex += `[${prev}][img${i}]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[${next}];`
        prev = next
      }
      filterComplex += `[xfaded]`
    } else if (transition === 'slide') {
      let prev = `img0`
      for (let i = 1; i < numImages; i++) {
        const offset = i * imgDuration - fadeDuration
        const next = i < numImages - 1 ? `xfade${i}` : `xfaded`
        filterComplex += `[${prev}][img${i}]xfade=transition=slideleft:duration=${fadeDuration}:offset=${offset}[${next}];`
        prev = next
      }
      filterComplex += `[xfaded]`
    } else if (transition === 'zoom') {
      let prev = `img0`
      for (let i = 1; i < numImages; i++) {
        const offset = i * imgDuration - fadeDuration
        const next = i < numImages - 1 ? `xfade${i}` : `xfaded`
        filterComplex += `[${prev}][img${i}]xfade=transition=smoothup:duration=${fadeDuration}:offset=${offset}[${next}];`
        prev = next
      }
      filterComplex += `[xfaded]`
    }

    // Overlay SVG text on top
    const svgInputIndex = numImages
    filterComplex += `[${svgInputIndex}:v]scale=${width}:${height}[overlay];`
    filterComplex += `[xfaded][overlay]overlay=0:0[outv]`

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map [outv]',
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        `-t ${numImages * imgDuration}`
      ])
      .output(outputPath)
      .on('start', cmdLine => console.log('FFmpeg started:', cmdLine))
      .on('progress', p => console.log(`FFmpeg progress: ${Math.round(p.percent || 0)}%`))
      .on('end', () => {
        console.log('FFmpeg done:', outputPath)
        // Cleanup temp files
        localImages.forEach(f => { try { fs.unlinkSync(f) } catch {} })
        try { fs.unlinkSync(svgPath) } catch {}
        resolve()
      })
      .on('error', err => {
        console.error('FFmpeg error:', err)
        localImages.forEach(f => { try { fs.unlinkSync(f) } catch {} })
        try { fs.unlinkSync(svgPath) } catch {}
        reject(err)
      })
      .run()
  })

  return { jobId, filename: outputFilename }
}
