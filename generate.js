import { getSession } from '../routes/auth.js'

export async function requireShop(req, res, next) {
  const shop = req.headers['x-shop'] || req.query.shop
  if (!shop) return res.status(401).json({ error: 'Missing shop header' })

  const session = await getSession(shop)
  if (!session) return res.status(401).json({ error: 'Shop not authenticated' })

  req.session = session
  req.shop = shop
  next()
}
