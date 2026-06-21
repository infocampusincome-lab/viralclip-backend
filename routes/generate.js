import express from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { requireShop } from '../middleware/auth.js'
import { generateAdCopy } from '../services/groq.js'
import { getProduct, getShopInfo } from '../services/shopify.js'
import { generateNormalImage, generateUGCImage } from '../services/imageGen.js'
import { query } from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

const PLAN_LIMITS = { free: 5, starter: 30, pro: 100, unlimited: 99999 }

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

router.post('/image', requireShop, async (req, res) => {
  const { productId, style, imageType, headline, subtext, cta } = req.body
  const { session, shop } = req

  const limit = PLAN_LIMITS[session.plan] || PLAN_LIMITS.free
  if (session.videos_used >= limit) {
    return res.status(403).json({ error: 'Image limit reached', upgrade: true })
  }

  try {
    const [product, shopInfo] = await Promise.all([
      getProduct(shop, session.access_token, productId),
      getShopInfo(shop, session.access_token)
    ])

    if (!product.images || product.images.length === 0) {
      return res.status(400).json({ error: 'Product has no images' })
    }

    const copy = await generateAdCopy({
      productTitle: product.title,
      price: product.price,
      currency: shopInfo.currency,
      style: style || 'promo',
      cta: cta || 'Shop Now'
    })

    const finalHeadline = headline || copy.headline
    const finalSubtext = subtext || copy.subtext
    const finalCta = cta || copy.cta

    let result

    if (imageType === 'ugc') {
      result = await generateUGCImage({
        imageUrl: product.images[0],
        headline: finalHeadline,
        caption: copy.caption,
        storeName: shopInfo.name
      })
    } else {
      result = await generateNormalImage({
        imageUrl: product.images[0],
        headline: finalHeadline,
        subtext: finalSubtext,
        cta: finalCta,
        price: product.price,
        currency: shopInfo.currency
      })
    }

    const { jobId, filename } = result

    await query(
      `INSERT INTO videos (id, shop, product_id, product_title, style, platform, headline, cta, file_path, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'done')`,
      [jobId, shop, productId, product.title, imageType || 'normal', 'image', finalHeadline, finalCta, filename]
    )

    await query(`UPDATE sessions SET videos_used = videos_used + 1 WHERE shop = $1`, [shop])

    res.json({
      success: true,
      jobId,
      downloadUrl: `/generate/download/${filename}`,
      caption: copy.caption,
      product: { title: product.title }
    })
  } catch (err) {
    console.error('Image gen error:', err)
    res.status(500).json({ error: 'Image generation failed. Please try again.' })
  }
})

router.get('/download/:filename', requireShop, (req, res) => {
  const { filename } = req.params
  if (!/^[a-f0-9-]{36}\.(png|mp4)$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  const filePath = path.join(__dirname, '../outputs', filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' })
  }
  const ext = path.extname(filename)
  const mimeType = ext === '.png' ? 'image/png' : 'video/mp4'
  res.setHeader('Content-Type', mimeType)
  res.download(filePath, `viralclip-${Date.now()}${ext}`, () => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  })
})

router.get('/history', requireShop, async (req, res) => {
  const { shop } = req
  const result = await query(
    `SELECT id, product_title, style, platform, headline, status, created_at
     FROM videos WHERE shop = $1 ORDER BY created_at DESC LIMIT 20`,
    [shop]
  )
  res.json({ videos: result.rows })
})

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

// TEMP ADMIN — remove before App Store submission
router.get("/admin-reset/:shop", async (req, res) => {
  try {
    await query(`UPDATE sessions SET videos_used = 0, plan = 'unlimited' WHERE shop = $1`, [req.params.shop])
    res.json({ success: true, message: `Reset ${req.params.shop} to unlimited` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
