import Groq from 'groq-sdk'
import dotenv from 'dotenv'
dotenv.config()

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function generateAdCopy({ productTitle, price, currency, style, cta }) {
  const styleGuides = {
    promo: 'urgent, sale-focused, use power words like LIMITED, SALE, DEAL',
    arrival: 'exciting, fresh, new arrival energy, trendy and aspirational',
    minimal: 'clean, single powerful statement, less is more',
    story: 'warm, emotional, brand story feel, connect with lifestyle'
  }

  const prompt = `You are an expert ecommerce video ad copywriter.

Product: ${productTitle}
Price: ${currency} ${price}
Ad style: ${style} — ${styleGuides[style] || 'engaging and clear'}
CTA: ${cta}

Generate a SHORT video ad text package. Respond ONLY in JSON, no markdown, no explanation:
{
  "headline": "main headline, max 6 words, punchy",
  "subtext": "supporting line, max 8 words",
  "cta": "call to action button text, max 4 words",
  "caption": "social media caption with 3-5 relevant hashtags, max 2 sentences"
}`

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 200
  })

  const raw = response.choices[0].message.content.trim()
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      headline: `Shop ${productTitle}`,
      subtext: `Only ${currency} ${price}`,
      cta: cta || 'Shop Now',
      caption: `Check out ${productTitle}! Limited stock available. #shopnow #sale #deals`
    }
  }
}

export async function generateImagePrompt({ productTitle, creatorType }) {
  const prompt = `You are an expert at writing AI image generation prompts for UGC (User Generated Content) ads.

Product: ${productTitle}
Creator type: ${creatorType}

Write a detailed image generation prompt for a realistic UGC-style photo. The image should look like an authentic social media post from a real customer.

Requirements:
- ${creatorType} holding or using the product naturally
- Casual, authentic setting (home, outdoors, lifestyle)
- Natural lighting, candid feel
- TikTok/Instagram UGC style
- High quality, photorealistic
- No text in the image

Respond with ONLY the prompt text, nothing else. Max 100 words.`

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 150
  })

  return response.choices[0].message.content.trim()
}
