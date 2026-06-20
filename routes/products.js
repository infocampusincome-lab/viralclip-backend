import express from 'express'
import { requireShop } from '../middleware/auth.js'
import { getProducts, getProduct, getShopInfo } from '../services/shopify.js'

const router = express.Router()

// GET /products — list all store products
router.get('/', requireShop, async (req, res) => {
  try {
    const { session, shop } = req
    const products = await getProducts(shop, session.access_token)
    res.json({ products })
  } catch (err) {
    console.error('Products fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET /products/:id — single product detail
router.get('/:id', requireShop, async (req, res) => {
  try {
    const { session, shop } = req
    const product = await getProduct(shop, session.access_token, req.params.id)
    res.json({ product })
  } catch (err) {
    console.error('Product fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// GET /products/shop/info
router.get('/shop/info', requireShop, async (req, res) => {
  try {
    const { session, shop } = req
    const info = await getShopInfo(shop, session.access_token)
    res.json({ shop: info })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop info' })
  }
})

export default router
