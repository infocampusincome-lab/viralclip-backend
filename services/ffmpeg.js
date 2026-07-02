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
const MUSIC_DIR = path.join(__dirname, '../music')

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

const PLATFORMS = {
  tiktok:    { width: 1080, height: 1920 },
  instagram: { width: 1080, height: 1080 },
  facebook:  { width: 1280, height: 720  }
}

const STYLE_COLORS = {
  promo:   '#FF4444',
  arrival: '#7B61FF',
  minimal: '#111111',
  story:   '#F4A261'
}

// Map mood names to actual filenames
export const MUSIC_TRACKS = [
  { id: 'none',        label: 'No Music',    file: null,               emoji: '🔇' },
  { id: 'unbeat',      label: 'Upbeat',      file: 'unbeat.mp3',       emoji: '⚡' },
  { id: 'chill',       label: 'Chill',       file: 'chill.mp3',        emoji: '😌' },
  { id: 'dramatic',    label: 'Dramatic',    file: 'dramatic.mp3',     emoji: '🎭' },
  { id: 'inspiring',   label: 'Inspiring',   file: 'inspiring.mp3',    emoji: '🌟' },
  { id: 'corporate',   label: 'Corporate',   file: 'corporate.mp3',    emoji: '💼' },
  { id: 'romantic',    label: 'Romantic',    file: 'romantic.mp3',     emoji: '❤️' },
  { id: 'energetic',   label: 'Energetic',   file: 'energetic.mp3',    emoji: '🔥' },
  { id: 'motivational',label: 'Motivational',file: 'motivational.mp3', emoji: '💪' },
  { id: 'ambient',     label: 'Ambient',     file: 'ambient.mp3',      emoji: '🌊' },
  { id: 'happy',       label: 'Happy',       file: 'happy.mp3',        emoji: '😊' },
  { id: 'epic',        label: 'Epic',        file: 'epic.mp3',         emoji: '🏆' },
  { id: 'sad',         label: 'Sad',         file: 'sad.mp3',          emoji: '😢' },
  { id: 'funky',       label: 'Funky',       file: 'funky.mp3',        emoji: '🎸' },
  { id: 'cinimatic',   label: 'Cinematic',   file: 'cinimatic.mp3',    emoji: '🎬' },
  { id: 'urban',       label: 'Urban',       file: 'urban.mp3',        emoji: '🏙️' },
]

// How many tracks each plan can access (by index in MUSIC_TRACKS, skipping 'none')
export const PLAN_MUSIC_LIMITS = {
  free:      2,
  starter:   5,
  pro:       10,
  unlimited: 15
}

async function downloadImage(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download image: ${url}`)
  const arrayBuffer = await res.arrayBuffer()
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer))
}

function buildTextFilter(headline, subtext, cta, width, height, colorBar) {
  const safeHeadline = (headline || '').replace(/[':]/g, ' ').slice(0, 40)
  const safeSubtext  = (subtext  || '').replace(/[':]/g, ' ').slice(0, 60)
  const safeCta      = (cta      || 'Shop Now').replace(/[':]/g, ' ').slice(0, 20)

  const fontSize    = width > 900 ? 64 : 48
  const subFontSize = Math.floor(fontSize * 0.55)
  const ctaFontSize = Math.floor(fontSize * 0.5)
  const barHeight   = Math.floor(height * 0.15)
  const barY        = height - barHeight
  const headlineY   = Math.floor(height * 0.35)

  return [
    `drawbox=x=0:y=${barY}:w=${width}:h=${barHeight}:color=${colorBar}@0.88:t=fill`,
    `drawtext=text='${safeHeadline}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${headlineY}:shadowx=3:shadowy=3:shadowcolor=black@0.6`,
    `drawtext=text='${safeSubtext}':fontsize=${subFontSize}:fontcolor=white@0.9:x=(w-text_w)/2:y=${headlineY + fontSize + 16}:shadowx=2:shadowy=2:shadowcolor=black@0.5`,
    `drawtext=text='${safeCta}':fontsize=${ctaFontSize}:fontcolor=white:x=(w-text_w)/2:y=${barY + Math.floor(barHeight / 2) - Math.floor(ctaFontSize / 2)}`
  ].join(',')
}

export async function generateVideo({
  images,
  headline,
  subtext,
  cta,
  style = 'promo',
  platform = 'tiktok',
  musicId = 'none',
  customMusicPath = null,
}) {
  const jobId = uuidv4()
  const jobDir = path.join(TEMP_DIR, jobId)
  fs.mkdirSync(jobDir, { recursive: true })

  const { width, height } = PLATFORMS[platform] || PLATFORMS.tiktok
  const colorBar = STYLE_COLORS[style] || STYLE_COLORS.promo
  const duration = 3

  const imageUrls = images.slice(0, 5)
  if (imageUrls.length === 0) throw new Error('No images provided')

  // Download all images
  const localImages = []
  for (let i = 0; i < imageUrls.length; i++) {
    const localPath = path.join(jobDir, `img_${i}.jpg`)
    await downloadImage(imageUrls[i], localPath)
    localImages.push(localPath)
  }

  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`)
  const totalDuration = duration * localImages.length
  const textFilter = buildTextFilter(headline, subtext, cta, width, height, colorBar)

  // Resolve music file
  let musicPath = null
  if (customMusicPath && fs.existsSync(customMusicPath)) {
    musicPath = customMusicPath
  } else if (musicId && musicId !== 'none') {
    const track = MUSIC_TRACKS.find(t => t.id === musicId)
    if (track?.file) {
      const candidate = path.join(MUSIC_DIR, track.file)
      if (fs.existsSync(candidate)) musicPath = candidate
    }
  }

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()

    // Add image inputs
    localImages.forEach(imgPath => {
      cmd = cmd.input(imgPath).inputOptions([`-loop 1`, `-t ${duration}`])
    })

    // Add music input if available
    if (musicPath) {
      cmd = cmd.input(musicPath)
    }

    const filterParts = []
    const streamLabels = []

    localImages.forEach((_, i) => {
      filterParts.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=24,` +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${duration - 0.4}:d=0.4[v${i}]`
      )
      streamLabels.push(`[v${i}]`)
    })

    filterParts.push(`${streamLabels.join('')}concat=n=${localImages.length}:v=1:a=0[vconcat]`)
    filterParts.push(`[vconcat]${textFilter}[vout]`)

    const outputOptions = [
      '-map [vout]',
      '-c:v libx264',
      '-preset ultrafast',
      '-crf 28',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      `-t ${totalDuration}`
    ]

    if (musicPath) {
      const musicInputIndex = localImages.length
      // Fade music out in last 2 seconds
      cmd.complexFilter([
        ...filterParts,
        `[${musicInputIndex}:a]afade=t=out:st=${totalDuration - 2}:d=2,atrim=0:${totalDuration}[aout]`
      ])
      outputOptions.push('-map [aout]')
      outputOptions.push('-c:a aac')
      outputOptions.push('-b:a 128k')
    } else {
      cmd.complexFilter(filterParts)
    }

    cmd
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('start', cmdLine => console.log('FFmpeg started:', cmdLine.slice(0, 120)))
      .on('progress', p => console.log(`FFmpeg progress: ${Math.round(p.percent || 0)}%`))
      .on('end', () => {
        console.log('FFmpeg done:', outputPath)
        fs.rmSync(jobDir, { recursive: true, force: true })
        if (customMusicPath && fs.existsSync(customMusicPath)) {
          fs.unlinkSync(customMusicPath)
        }
        resolve({ jobId, outputPath, filename: `${jobId}.mp4` })
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err.message)
        fs.rmSync(jobDir, { recursive: true, force: true })
        reject(err)
      })
      .run()
  })
}

export function cleanupVideo(filename) {
  const filePath = path.join(OUTPUT_DIR, filename)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}
