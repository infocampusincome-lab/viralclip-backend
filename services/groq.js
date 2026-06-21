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
  const prompt = `You are an expert photographer and AI image prompt engineer specializing in UGC (User Generated Content) ads for ecommerce.

Product: "${productTitle}"
Creator: ${creatorType}

Write a PHOTOREALISTIC image generation prompt. Rules:
- Be extremely specific about what the person is doing with the product
- The product must be the EXACT item: "${productTitle}" — do not replace it with something else
- Real photograph style, NOT illustration, NOT cartoon, NOT painting, NOT anime
- Person must be clearly visible and naturally interacting with the product
- Casual indoor or outdoor setting with natural light
- Shot like a smartphone selfie or candid photo
- Mention: "RAW photo, photorealistic, 85mm lens, natural lighting, UGC style, authentic, candid"
- NO text, NO watermarks, NO logos in image

Respond with ONLY the prompt. Max 80 words.`

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 120
  })

  const basePrompt = response.choices[0].message.content.trim()
  
  // Append quality boosters and anti-cartoon terms
  return `${basePrompt}, RAW photo, photorealistic, DSLR, 85mm lens, natural lighting, UGC content, authentic, candid shot, real person, NOT cartoon, NOT illustration, NOT anime, NOT drawing, hyperrealistic, shot on iPhone`
}
