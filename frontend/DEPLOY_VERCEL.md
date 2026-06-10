# 🚀 YieldMind Frontend — Vercel Deployment Guide

## Prerequisites

- Node.js >= 18
- Vercel account ([vercel.com](https://vercel.com))
- Vercel CLI (`npm i -g vercel`)

## Quick Deploy

### Option 1: CLI Deployment

```bash
cd frontend

# Login to Vercel (first time only)
npx vercel login

# Deploy to preview
npx vercel

# Deploy to production
npx vercel --prod
```

### Option 2: Deploy Script

```bash
cd frontend
chmod +x scripts/deploy-vercel.sh

# Production deploy
./scripts/deploy-vercel.sh

# Preview deploy
./scripts/deploy-vercel.sh --preview
```

### Option 3: Git Integration (Recommended)

1. Push code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repository
4. Set **Root Directory** to `frontend`
5. Vercel auto-detects Next.js — click **Deploy**

Every push to `main` will auto-deploy to production.

## Configuration

The `vercel.json` is already configured with:

| Setting | Value |
|---------|-------|
| Framework | Next.js 14 |
| Region | `sin1` (Singapore, close to BSC nodes) |
| API Proxy | `/api/*` → backend on Render |
| CORS | Enabled for all origins |
| BSC Chain ID | 97 (testnet) |
| BSC RPC | Public testnet RPC |

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_NAME` | No | App name (default: YieldMind) |
| `NEXT_PUBLIC_BSC_CHAIN_ID` | Yes | BSC chain ID (97 for testnet) |
| `NEXT_PUBLIC_BSC_RPC` | Yes | BSC RPC endpoint |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect project ID for RainbowKit |

## Architecture

```
Browser → Vercel (Next.js SSR)
              │
              ├── Static pages (SSG/SSR)
              │
              └── /api/*  →  Backend (Render)
                              └── Fastify API + AI Agents
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check Node.js version (>= 18), run `npm install` locally first |
| API 404 | Verify backend URL in `vercel.json` rewrites |
| Wallet won't connect | Ensure WalletConnect project ID is set |
| RPC errors | Check `NEXT_PUBLIC_BSC_RPC` is accessible |
