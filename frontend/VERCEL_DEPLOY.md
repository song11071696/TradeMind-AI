# YieldMind Frontend - Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI** (optional): `npm i -g vercel`
3. **GitHub Repository**: [NousResearch/YieldMind](https://github.com/NousResearch/YieldMind)

## Quick Deploy (One-Click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/NousResearch/YieldMind&root-directory=frontend)

## Deploy via Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository: `NousResearch/YieldMind`
3. **Root Directory**: Set to `frontend`
4. **Framework Preset**: Next.js (auto-detected)
5. **Build Settings**:
   - Build Command: `next build`
   - Output Directory: `.next`
   - Install Command: `npm install`
6. Click **Deploy**

## Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to frontend directory
cd frontend

# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# Deploy to production
vercel --prod
```

## Environment Variables

Set these in the Vercel dashboard under **Settings > Environment Variables**:

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_APP_NAME` | `YieldMind` | Application name |
| `NEXT_PUBLIC_BSC_CHAIN_ID` | `97` | BSC Testnet chain ID |
| `NEXT_PUBLIC_BSC_RPC` | `https://bsc-testnet-rpc.publicnode.com` | BSC Testnet RPC URL |
| `NEXT_PUBLIC_WALLETCONNECT_ID` | (your ID) | WalletConnect project ID |

## Custom Domain

1. Go to your project in Vercel dashboard
2. Navigate to **Settings > Domains**
3. Add your custom domain (e.g., `yieldmind.app`)
4. Configure DNS records as instructed

## Architecture Notes

- The frontend is a **Next.js 14** app with App Router
- API requests to `/api/*` are proxied to the backend via `vercel.json` rewrites
- Update the backend URL in `vercel.json` when deploying the backend to production
- The frontend supports wallet connection via wagmi/Web3 for BSC Testnet

## Post-Deployment

1. Verify the deployment at the Vercel-provided URL
2. Test wallet connection functionality
3. Update the backend CORS settings to allow the new frontend domain
4. Monitor build logs for any issues

## Troubleshooting

- **Build fails**: Check that all dependencies are in `package.json`
- **API errors**: Verify the backend URL in `vercel.json` rewrites
- **Wallet issues**: Ensure WalletConnect project ID is set correctly
