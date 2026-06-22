import express from 'express'
import { requireShop } from '../middleware/auth.js'
import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()

const PLANS = {
  starter: { name: 'MeshClip Starter', price: 25.00, images: 30, trialDays: 7 },
  pro:     { name: 'MeshClip Pro',     price: 50.00, images: 70, trialDays: 7 },
  unlimited: { name: 'MeshClip Unlimited', price: 70.00, images: 99999, trialDays: 7 }
}

const SHOPIFY_API_VERSION = '2025-01'

async function shopifyGraphQL(shop, accessToken, gqlQuery, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: gqlQuery, variables })
  })
  const data = await res.json()
  console.log('GraphQL response:', JSON.stringify(data, null, 2))
  return data
}

// GET /billing/plans
router.get('/plans', requireShop, async (req, res) => {
  const { session } = req
  res.json({
    currentPlan: session.plan,
    plans: [
      { id: 'free',      name: 'Free',      price: 0,  images: 5,     current: session.plan === 'free' },
      { id: 'starter',   name: 'Starter',   price: 25, images: 30,    trialDays: 7, current: session.plan === 'starter' },
      { id: 'pro',       name: 'Pro',       price: 50, images: 70,    trialDays: 7, current: session.plan === 'pro' },
      { id: 'unlimited', name: 'Unlimited', price: 70, images: 'Unlimited', trialDays: 7, current: session.plan === 'unlimited' }
    ]
  })
})

// POST /billing/subscribe/:planId
router.post('/subscribe/:planId', requireShop, async (req, res) => {
  const { planId } = req.params
  const { session, shop } = req

  const plan = PLANS[planId]
  if (!plan) return res.status(400).json({ error: 'Invalid plan' })

  // Return URL goes to backend confirm endpoint
  const returnUrl = `${process.env.HOST}/billing/confirm?shop=${shop}&plan=${planId}`
  const isTest = process.env.NODE_ENV !== 'production'

  console.log(`Creating subscription for ${shop}, plan: ${planId}, test: ${isTest}`)
  console.log('Return URL:', returnUrl)

  const mutation = `
    mutation CreateSubscription($name: String!, $returnUrl: URL!, $trialDays: Int, $amount: Decimal!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: $amount, currencyCode: USD }
              interval: EVERY_30_DAYS
            }
          }
        }]
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id status }
      }
    }
  `

  try {
    const data = await shopifyGraphQL(shop, session.access_token, mutation, {
      name: plan.name,
      returnUrl,
      trialDays: plan.trialDays,
      amount: plan.price.toFixed(2),
      test: isTest
    })

    const result = data.data?.appSubscriptionCreate

    if (!result) {
      console.error('No result from GraphQL:', data)
      return res.status(500).json({ error: 'No response from Shopify billing API' })
    }

    if (result.userErrors?.length > 0) {
      console.error('User errors:', result.userErrors)
      return res.status(400).json({ error: result.userErrors[0].message })
    }

    if (!result.confirmationUrl) {
      console.error('No confirmation URL:', result)
      return res.status(500).json({ error: 'No confirmation URL returned' })
    }

    res.json({ confirmationUrl: result.confirmationUrl })
  } catch (err) {
    console.error('Billing error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /billing/confirm — Shopify redirects here after approval
router.get('/confirm', async (req, res) => {
  const { shop, plan } = req.query
  if (!shop || !plan) return res.status(400).send('Missing parameters')

  try {
    await query(
      `UPDATE sessions SET plan = $1, videos_used = 0 WHERE shop = $2`,
      [plan, shop]
    )
    console.log(`Plan activated: ${shop} → ${plan}`)
    res.redirect(`${process.env.FRONTEND_URL}?shop=${shop}&upgraded=true&plan=${plan}`)
  } catch (err) {
    console.error('Confirm error:', err)
    res.status(500).send('Failed to confirm subscription')
  }
})

// POST /billing/cancel
router.post('/cancel', requireShop, async (req, res) => {
  const { shop } = req
  try {
    await query(`UPDATE sessions SET plan = 'free', videos_used = 0 WHERE shop = $1`, [shop])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel' })
  }
})

export default router
