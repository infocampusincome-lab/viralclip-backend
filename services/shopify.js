const SHOPIFY_API_VERSION = '2026-04'

export async function shopifyFetch(shop, accessToken, endpoint) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`
  console.log('Shopify fetch:', url)
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

export async function getProducts(shop, accessToken) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  let allProducts = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : ''
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `{
          products(first: 50${afterClause}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                variants(first: 1) { edges { node { price } } }
                images(first: 10) { edges { node { url } } }
              }
            }
          }
        }`
      })
    })

    console.log('GraphQL status:', res.status)
    const data = await res.json()
    console.log('GraphQL response:', JSON.stringify(data).slice(0, 300))

    if (!data.data) throw new Error(`GraphQL error: ${JSON.stringify(data)}`)

    const { edges, pageInfo } = data.data.products

    const products = edges.map(({ node: p }) => ({
      id: p.id.split('/').pop(),
      title: p.title,
      price: p.variants.edges[0]?.node.price || '0.00',
      images: p.images.edges.map(e => e.node.url),
      thumbnail: p.images.edges[0]?.node.url || null
    }))

    allProducts = [...allProducts, ...products]
    hasNextPage = pageInfo.hasNextPage
    cursor = pageInfo.endCursor
  }

  console.log(`Fetched ${allProducts.length} products total`)
  return allProducts
}

export async function getProduct(shop, accessToken, productId) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `{
        product(id: "gid://shopify/Product/${productId}") {
          id
          title
          descriptionHtml
          variants(first: 1) { edges { node { price } } }
          images(first: 10) { edges { node { url } } }
        }
      }`
    })
  })

  const data = await res.json()
  console.log('Product GraphQL:', JSON.stringify(data).slice(0, 200))

  if (!data.data?.product) throw new Error(`Product not found: ${productId}`)

  const p = data.data.product
  return {
    id: p.id.split('/').pop(),
    title: p.title,
    price: p.variants.edges[0]?.node.price || '0.00',
    images: p.images.edges.map(e => e.node.url),
    thumbnail: p.images.edges[0]?.node.url || null,
    description: p.descriptionHtml?.replace(/<[^>]*>/g, '').slice(0, 200) || ''
  }
}

export async function getShopInfo(shop, accessToken) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `{
        shop {
          name
          currencyCode
          myshopifyDomain
          email
        }
      }`
    })
  })

  const data = await res.json()
  console.log('Shop GraphQL:', JSON.stringify(data).slice(0, 200))

  if (!data.data?.shop) throw new Error('Failed to get shop info')

  const s = data.data.shop
  return {
    name: s.name,
    currency: s.currencyCode,
    domain: s.myshopifyDomain,
    email: s.email
  }
}
