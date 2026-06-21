import express from 'express'
import { requireShop } from '../middleware/auth.js'
import { query } from '../db/index.js'
import dotenv from 'dotenv'
dotenv.config()

const router = express.Router()

const PLANS = {
  starter: {
    name: 'MeshClip Starter',
    price: 25.00,
    interval: 'EVERY_30_DAYS',
    images: 30,
    trialDays: 7
  },
  pro: {
    name: 'MeshClip Pro',
    price: 50.00,
    interval: 'EVERY_30_DAYS',
    images: 70,
    trialDays: 7
  },
  unlimited: {
    name: 'MeshClip Unlimited',
    price: 70.00,
    interval: 'EVERY_30_DAYS',
    images: 99999,
    trialDays: 7
  }
}

const SHOPIFY_API_VERSION = '2024-07'

async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })
  return res.json()
}

// GET /billing/plans — return available plans
router.get('/plans', requireShop, async (req, res) => {
  const { session } = req
  res.json({
    currentPlan: session.plan,
    plans: [
      { id: 'free', name: 'Free', price: 0, images: 5, current: session.plan === 'free' },
      { id: 'starter', name: 'Starter', price: 25, images: 30, trialDays: 7, current: session.plan === 'starter' },
      { id: 'pro', name: 'Pro', price: 50, images: 70, trialDays: 7, current: session.plan === 'pro' },
      { id: 'unlimited', name: 'Unlimited', price: 70, images: 'Unlimited', trialDays: 7, current: session.plan === 'unlimited' }
    ]
  })
})

// POST /billing/subscribe/:plan — create Shopify subscription
router.post('/subscribe/:planId', requireShop, async (req, res) => {
  const { planId } = req.params
  const { session, shop } = req

  const plan = PLANS[planId]
  if (!plan) return res.status(400).json({ error: 'Invalid plan' })

  const returnUrl = `${process.env.HOST}/billing/confirm?shop=${shop}&plan=${planId}`

  const mutation = `
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: ${process.env.NODE_ENV !== 'production'}
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id status }
      }
    }
  `

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    lineItems: [{
      plan: {
        appRecurringPricingDetails: {
          price: { amount: plan.price, currencyCode: 'USD' },
          interval: plan.interval
        }
      }
    }]
  }

  try {
    const data = await shopifyGraphQL(shop, session.access_token, mutation, variables)
    const result = data.data?.appSubscriptionCreate

    if (result?.userErrors?.length > 0) {
      return res.status(400).json({ error: result.userErrors[0].message })
    }

    res.json({ confirmationUrl: result.confirmationUrl })
  } catch (err) {
    console.error('Billing error:', err)
    res.status(500).json({ error: 'Failed to create subscription' })
  }
})

// GET /billing/confirm — Shopify redirects here after merchant approves
router.get('/confirm', async (req, res) => {
  const { shop, plan, charge_id } = req.query

  if (!shop || !plan) return res.status(400).send('Missing parameters')

  try {
    // Update plan in database
    const planLimits = { starter: 30, pro: 70, unlimited: 99999 }
    await query(
      `UPDATE sessions SET plan = $1, videos_used = 0 WHERE shop = $2`,
      [plan, shop]
    )

    console.log(`Plan updated: ${shop} → ${plan}`)
    res.redirect(`${process.env.FRONTEND_URL}?shop=${shop}&upgraded=true&plan=${plan}`)
  } catch (err) {
    console.error('Confirm error:', err)
    res.status(500).send('Failed to confirm subscription')
  }
})

// POST /billing/cancel — cancel subscription
router.post('/cancel', requireShop, async (req, res) => {
  const { session, shop } = req

  try {
    await query(`UPDATE sessions SET plan = 'free', videos_used = 0 WHERE shop = $1`, [shop])
    res.json({ success: true, message: 'Subscription cancelled' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel' })
  }
})

export default router
