# syntax=docker/dockerfile:1
# bsmart-backend — dev branch — Cloudflare Containers image
FROM node:20-bookworm-slim

WORKDIR /app

# ca-certificates — needed for outbound HTTPS to MongoDB Atlas, Razorpay,
# Twilio, Google/Apple OAuth, SMTP, etc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install deps first so this layer is cached across code-only changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App code (this also bakes in the committed uploads/*.jpg legacy files —
# see the migration notes for why that's fine here)
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "server.js"]
