const SHOPIFY_API_VERSION = '2026-04'

export async function shopifyFetch(shop, accessToken, endpoint) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`
  console.log('Shopify fetch:', url)
  console.log('Using token:', accessToken?.slice(0, 10) + '...')
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  })
  console.log('Shopify response status:', res.status)
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`)
  return res.json()
}

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

export async function getShopInfo(shop, accessToken) {
  const data = await shopifyFetch(shop, accessToken, 'shop.json')
  return {
    name: data.shop.name,
    currency: data.shop.currency,
    domain: data.shop.domain,
    email: data.shop.email
  }
}
