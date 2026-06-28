import express from 'express'
import crypto from 'crypto'
import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()
const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, HOST, FRONTEND_URL } = process.env

router.get('/install', (req, res) => {
  const { shop } = req.query
  if (!shop) return res.status(400).send('Missing shop parameter')
  console.log('Install request for shop:', shop)
  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = `${HOST}/auth/callback`
  // Request offline access token (expiring) - required by Shopify new policy
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&state=${state}&redirect_uri=${redirectUri}&grant_options[]=offline`
  console.log('Redirecting to:', installUrl)
  res.redirect(installUrl)
})

router.get('/callback', async (req, res) => {
  console.log('Callback received:', req.query)
  const { shop, code, hmac } = req.query

  const params = Object.keys(req.query)
    .filter(k => k !== 'hmac')
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&')

  const digest = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(params)
    .digest('hex')

  console.log('HMAC check:', digest === hmac ? 'PASSED' : 'FAILED')
  if (digest !== hmac) return res.status(401).send('HMAC verification failed')

  try {
    console.log('Exchanging code for token...')
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      })
    })

    const tokenData = await response.json()
    console.log('Token response:', JSON.stringify(tokenData))

    const access_token = tokenData.access_token
    const scope = tokenData.scope

    if (!access_token) {
      console.error('No access token received:', tokenData)
      return res.status(500).send('Failed to get access token')
    }

    console.log('Got access token, saving to DB...')
    await query(
      `INSERT INTO sessions (shop, access_token, scope)
       VALUES ($1, $2, $3)
       ON CONFLICT (shop) DO UPDATE SET access_token = $2, scope = $3`,
      [shop, access_token, scope]
    )
    console.log('Session saved for shop:', shop)
    res.redirect(`${FRONTEND_URL}?shop=${shop}&installed=true`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).send('Auth failed')
  }
})

export async function getSession(shop) {
  const result = await query('SELECT * FROM sessions WHERE shop = $1', [shop])
  return result.rows[0] || null
}

export default router
