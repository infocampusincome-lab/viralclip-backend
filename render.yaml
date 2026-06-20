services:
  - type: web
    name: viralclip-backend
    env: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: SHOPIFY_API_KEY
        sync: false
      - key: SHOPIFY_API_SECRET
        sync: false
      - key: SHOPIFY_SCOPES
        value: read_products,read_themes
      - key: HOST
        sync: false
      - key: GROQ_API_KEY
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: FRONTEND_URL
        sync: false
