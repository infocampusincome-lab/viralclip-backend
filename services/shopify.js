import dotenv from 'dotenv'
dotenv.config()

const SHOPIFY_API_VERSION = '2024-07'

export async function shopifyFetch(shop, accessToken, endpoint) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  })
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`)
  return res.json()
}

// Get all products with images
export async function getProducts(shop, accessToken, limit = 20) {
  const data = await shopifyFetch(shop, accessToken, `products.json?limit=${limit}&fields=id,title,images,variants`)
  return data.products.map(p => ({
    id: p.id,
    title: p.title,
    price: p.variants?.[0]?.price || '0.00',
    images: p.images.map(img => img.src),
    thumbnail: p.images?.[0]?.src || null
  }))
}

// Get single product
export async function getProduct(shop, accessToken, productId) {
  const data = await shopifyFetch(shop, accessToken, `products/${productId}.json`)
  const p = data.product
  return {
    id: p.id,
    title: p.title,
    price: p.variants?.[0]?.price || '0.00',
    images: p.images.map(img => img.src),
    description: p.body_html?.replace(/<[^>]*>/g, '').slice(0, 200) || ''
  }
}

// Get store info (name, currency, domain)
export async function getShopInfo(shop, accessToken) {
  const data = await shopifyFetch(shop, accessToken, 'shop.json')
  return {
    name: data.shop.name,
    currency: data.shop.currency,
    domain: data.shop.domain,
    email: data.shop.email
  }
}
