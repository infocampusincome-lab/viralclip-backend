import { query } from '../db/index.js'

export async function requireShop(req, res, next) {
  const shop = req.headers['x-shop'] || req.query.shop
  if (!shop) return res.status(401).json({ error: 'Missing shop header' })

  const result = await query('SELECT * FROM sessions WHERE shop = $1', [shop])
  const session = result.rows[0]
  if (!session) return res.status(401).json({ error: 'Shop not authenticated' })

  req.session = session
  req.shop = shop
  next()
}
