import express from 'express'
import crypto from 'crypto'
import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, HOST, FRONTEND_URL } = process.env

// Step 1 — redirect merchant to Shopify OAuth
router.get('/install', (req, res) => {
  const { shop } = req.query
  if (!shop) return res.status(400).send('Missing shop parameter')

  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = `${HOST}/auth/callback`
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&state=${state}&redirect_uri=${redirectUri}`

  res.cookie('state', state, { httpOnly: true, sameSite: 'none', secure: true })
  res.redirect(installUrl)
})

// Step 2 — Shopify redirects back here with code
router.get('/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query

  // Verify HMAC signature from Shopify
  const params = Object.keys(req.query)
    .filter(k => k !== 'hmac')
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&')

  const digest = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(params)
    .digest('hex')

  if (digest !== hmac) return res.status(401).send('HMAC verification failed')

  try {
    // Exchange code for access token
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      })
    })

    const { access_token, scope } = await response.json()

    // Save session to DB
    await query(
      `INSERT INTO sessions (shop, access_token, scope)
       VALUES ($1, $2, $3)
       ON CONFLICT (shop) DO UPDATE SET access_token = $2, scope = $3`,
      [shop, access_token, scope]
    )

    // Redirect to frontend app
    res.redirect(`${FRONTEND_URL}?shop=${shop}&installed=true`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).send('Auth failed')
  }
})

// Verify shop session middleware helper
export async function getSession(shop) {
  const result = await query('SELECT * FROM sessions WHERE shop = $1', [shop])
  return result.rows[0] || null
}

export default router
