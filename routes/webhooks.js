import express from 'express'
import crypto from 'crypto'
import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()

// Verify webhook is from Shopify
function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256']
  const body = req.body // Buffer from express.raw()

  if (!hmac || !body) return false

  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body)
    .digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))
  } catch {
    return false
  }
}

// Unified compliance webhook endpoint
// Shopify sends customers/data_request, customers/redact, and shop/redact
// all to this single URI, differentiated by the X-Shopify-Topic header
router.post('/', async (req, res) => {
  const topic = req.headers['x-shopify-topic']
  console.log('Webhook received, topic:', topic)

  if (!verifyWebhook(req)) {
    console.log('HMAC verification failed for topic:', topic)
    return res.status(401).send('Unauthorized')
  }

  let body = {}
  try {
    body = JSON.parse(req.body.toString())
  } catch (err) {
    console.error('Failed to parse webhook body:', err)
  }

  try {
    switch (topic) {
      case 'customers/data_request':
        console.log('Customer data request webhook received')
        // MeshClip does not store customer personal data
        break

      case 'customers/redact':
        console.log('Customer redact webhook received')
        // MeshClip does not store customer personal data — nothing to delete
        break

      case 'shop/redact': {
        console.log('Shop redact webhook received')
        const shop = body.shop_domain || body.myshopify_domain
        if (shop) {
          await query('DELETE FROM sessions WHERE shop = $1', [shop])
          await query('DELETE FROM videos WHERE shop = $1', [shop])
          console.log('Shop data deleted for:', shop)
        }
        break
      }

      case 'app/uninstalled': {
        console.log('App uninstalled webhook received')
        const shop = body.myshopify_domain || body.domain
        if (shop) {
          await query('DELETE FROM sessions WHERE shop = $1', [shop])
          console.log('Session deleted for uninstalled shop:', shop)
        }
        break
      }

      default:
        console.log('Unhandled webhook topic:', topic)
    }

    res.status(200).send('OK')
  } catch (err) {
    console.error('Webhook processing error:', err)
    res.status(200).send('OK') // still acknowledge receipt to avoid retries
  }
})

export default router
