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
  origin: [process.env.FRONTEND_URL, 'https://admin.shopify.com'],
  credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'viralclip-backend' }))

// Routes
app.use('/auth', authRouter)
app.use('/products', productsRouter)
app.use('/generate', generateRouter)

// Start server
async function start() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`ViralClip backend running on port ${PORT}`)
  })
}

start().catch(console.error)
