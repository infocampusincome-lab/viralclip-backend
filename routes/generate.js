import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { requireShop } from '../middleware/auth.js'
import { generateVideo, cleanupVideo } from '../services/ffmpeg.js'
import { generateAdCopy } from '../services/groq.js'
import { getProduct, getShopInfo } from '../services/shopify.js'
import { query } from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

const PLAN_LIMITS = {
  free: 5,
  starter: 30,
  pro: 100,
  unlimited: 99999
}

// POST /generate/copy — generate AI ad copy only (preview step)
router.post('/copy', requireShop, async (req, res) => {
  const { productId, style, cta } = req.body
  const { session, shop } = req

  try {
    const [product, shopInfo] = await Promise.all([
      getProduct(shop, session.access_token, productId),
      getShopInfo(shop, session.access_token)
    ])

    const copy = await generateAdCopy({
      productTitle: product.title,
      price: product.price,
      currency: shopInfo.currency,
      style,
      cta: cta || 'Shop Now'
    })

    res.json({ copy, product })
  } catch (err) {
    console.error('Copy gen error:', err)
    res.status(500).json({ error: 'Failed to generate copy' })
  }
})

// POST /generate/video — full video generation
router.post('/video', requireShop, async (req, res) => {
  const { productId, style, platform, headline, subtext, cta, musicMood } = req.body
  const { session, shop } = req

  // Check plan limits
  const limit = PLAN_LIMITS[session.plan] || PLAN_LIMITS.free
  if (session.videos_used >= limit) {
    return res.status(403).json({
      error: 'Video limit reached',
      limit,
      plan: session.plan,
      upgrade: true
    })
  }

  try {
    const product = await getProduct(shop, session.access_token, productId)

    if (!product.images || product.images.length === 0) {
      return res.status(400).json({ error: 'Product has no images' })
    }

    const { jobId, outputPath, filename } = await generateVideo({
      images: product.images,
      headline: headline || product.title,
      subtext: subtext || `Only $${product.price}`,
      cta: cta || 'Shop Now',
      style,
      platform,
      musicMood
    })

    // Save video record to DB
    await query(
      `INSERT INTO videos (id, shop, product_id, product_title, style, platform, headline, cta, file_path, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'done')`,
      [jobId, shop, productId, product.title, style, platform, headline, cta, filename]
    )

    // Increment usage counter
    await query(
      `UPDATE sessions SET videos_used = videos_used + 1 WHERE shop = $1`,
      [shop]
    )

    res.json({
      success: true,
      videoId: jobId,
      downloadUrl: `/generate/download/${filename}`,
      product: { title: product.title }
    })
  } catch (err) {
    console.error('Video gen error:', err)
    res.status(500).json({ error: 'Video generation failed. Please try again.' })
  }
})

// GET /generate/download/:filename — serve and delete video file
router.get('/download/:filename', requireShop, (req, res) => {
  const { filename } = req.params
  // Basic security: only allow uuid.mp4 pattern
  if (!/^[a-f0-9-]{36}\.mp4$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  const filePath = path.join(__dirname, '../outputs', filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found or already downloaded' })
  }

  res.download(filePath, `viralclip-${Date.now()}.mp4`, (err) => {
    if (!err) cleanupVideo(filename)
  })
})

// GET /generate/history — past videos for this shop
router.get('/history', requireShop, async (req, res) => {
  const { shop } = req
  const result = await query(
    `SELECT id, product_title, style, platform, headline, status, created_at
     FROM videos WHERE shop = $1 ORDER BY created_at DESC LIMIT 20`,
    [shop]
  )
  res.json({ videos: result.rows })
})

// GET /generate/usage — current plan usage
router.get('/usage', requireShop, async (req, res) => {
  const { session } = req
  const limit = PLAN_LIMITS[session.plan] || PLAN_LIMITS.free
  res.json({
    used: session.videos_used,
    limit,
    plan: session.plan,
    remaining: Math.max(0, limit - session.videos_used)
  })
})

export default router
