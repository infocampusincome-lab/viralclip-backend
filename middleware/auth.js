import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET } = process.env

async function refreshToken(session) {
  console.log('Refreshing token for shop:', session.shop)
  const response = await fetch(`https://${session.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      grant_type: 'refresh_token',
      refresh_token: session.refresh_token,
    }),
  })

  const data = await response.json()
  if (!data.access_token) {
    throw new Error('Failed to refresh token: ' + JSON.stringify(data))
  }

  const expires_at = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null
  const refresh_token_expires_at = data.refresh_token_expires_in
    ? new Date(Date.now() + data.refresh_token_expires_in * 1000)
    : null

  await query(
    `UPDATE sessions SET access_token = $2, refresh_token = $3, expires_at = $4, refresh_token_expires_at = $5
     WHERE shop = $1`,
    [session.shop, data.access_token, data.refresh_token || session.refresh_token, expires_at, refresh_token_expires_at]
  )

  console.log('Token refreshed for shop:', session.shop)
  return { ...session, access_token: data.access_token }
}

export async function requireShop(req, res, next) {
  const shop = req.headers['x-shop'] || req.query.shop
  if (!shop) return res.status(401).json({ error: 'Missing shop header' })

  const result = await query('SELECT * FROM sessions WHERE shop = $1', [shop])
  let session = result.rows[0]

  if (!session) return res.status(401).json({ error: 'Shop not authenticated' })

  // Check if token is expired or about to expire (within 5 minutes)
  const now = new Date()
  const expiresAt = session.expires_at ? new Date(session.expires_at) : null
  const isExpired = expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000

  if (isExpired && session.refresh_token) {
    try {
      session = await refreshToken(session)
    } catch (err) {
      console.error('Token refresh failed:', err.message)
      return res.status(401).json({ error: 'Session expired. Please reinstall the app.', reinstall: true })
    }
  }

  req.session = session
  req.shop = shop
  next()
}
