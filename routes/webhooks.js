import express from 'express'
import crypto from 'crypto'
import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()

// Verify webhook is from Shopify
function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256']
  const body = req.rawBody
  if (!hmac || !body) return false
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body)
    .digest('base64')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))
}

// GDPR: Customer data request
router.post('/customers/data_request', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Customer data request webhook received')
  // MeshClip does not store customer personal data
  res.status(200).send('OK')
})

// GDPR: Customer redact
router.post('/customers/redact', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Customer redact webhook received')
  // MeshClip does not store customer personal data — nothing to delete
  res.status(200).send('OK')
})

// GDPR: Shop redact — delete all shop data when merchant uninstalls
router.post('/shop/redact', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('Shop redact webhook received')
  try {
    const body = JSON.parse(req.body)
    const shop = body.myshopify_domain
    if (shop) {
      await query('DELETE FROM sessions WHERE shop = $1', [shop])
      await query('DELETE FROM videos WHERE shop = $1', [shop])
      console.log('Shop data deleted for:', shop)
    }
  } catch (err) {
    console.error('Shop redact error:', err)
  }
  res.status(200).send('OK')
})

// App uninstalled webhook
router.post('/app/uninstalled', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('App uninstalled webhook received')
  try {
    const body = JSON.parse(req.body)
    const shop = body.myshopify_domain
    if (shop) {
      await query('DELETE FROM sessions WHERE shop = $1', [shop])
      console.log('Session deleted for uninstalled shop:', shop)
    }
  } catch (err) {
    console.error('Uninstall webhook error:', err)
  }
  res.status(200).send('OK')
})

export default router
