import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initDB, query } from './db/index.js'
import authRouter from './routes/auth.js'
import productsRouter from './routes/products.js'
import generateRouter from './routes/generate.js'
import billingRouter from './routes/billing.js'
import webhooksRouter from './routes/webhooks.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: '*' }))

// Raw body needed for webhook verification
app.use('/webhooks', express.raw({ type: 'application/json' }))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'meshclip-backend' }))

app.get('/', (req, res) => {
  const shop = req.query.shop
  if (shop) return res.redirect(`/auth/install?shop=${shop}`)
  res.redirect(process.env.FRONTEND_URL)
})

// ONE-TIME: Register webhooks for existing shops
app.get('/setup-webhooks', async (req, res) => {
  try {
    const result = await query('SELECT shop, access_token FROM sessions')
    const shops = result.rows

    if (!shops.length) {
      return res.json({ message: 'No shops found in DB' })
    }

    const HOST = process.env.HOST
    const webhooks = [
      { topic: 'customers/data_request', address: `${HOST}/webhooks/customers/data_request` },
      { topic: 'customers/redact', address: `${HOST}/webhooks/customers/redact` },
      { topic: 'shop/redact', address: `${HOST}/webhooks/shop/redact` },
      { topic: 'app/uninstalled', address: `${HOST}/webhooks/app/uninstalled` },
    ]

    const results = []

    for (const { shop, access_token } of shops) {
      for (const webhook of webhooks) {
        const r = await fetch(`https://${shop}/admin/api/2026-04/webhooks.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': access_token,
          },
          body: JSON.stringify({
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: 'json',
            },
          }),
        })
        const data = await r.json()
        results.push({ shop, topic: webhook.topic, result: data.webhook ? 'registered' : JSON.stringify(data) })
      }
    }

    res.json({ success: true, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.use('/auth', authRouter)
app.use('/products', productsRouter)
app.use('/generate', generateRouter)
app.use('/billing', billingRouter)
app.use('/webhooks', webhooksRouter)

async function start() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`MeshClip backend running on port ${PORT}`)
  })
}

start().catch(console.error)
