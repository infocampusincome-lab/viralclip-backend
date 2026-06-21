import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initDB } from './db/index.js'
import authRouter from './routes/auth.js'
import productsRouter from './routes/products.js'
import generateRouter from './routes/generate.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: function(origin, callback) {
    const allowed = [
      process.env.FRONTEND_URL,
      'https://meshclip.netlify.app',
      'https://admin.shopify.com'
    ]
    if (!origin || allowed.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'viralclip-backend' }))

app.use('/auth', authRouter)
app.use('/products', productsRouter)
app.use('/generate', generateRouter)

async function start() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`ViralClip backend running on port ${PORT}`)
  })
}

start().catch(console.error)
