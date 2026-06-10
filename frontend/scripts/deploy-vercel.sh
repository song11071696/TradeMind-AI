#!/bin/bash
# ============================================================
# YieldMind Frontend — Vercel Deployment Script
# ============================================================
# Usage:
#   ./scripts/deploy-vercel.sh            # Deploy to production
#   ./scripts/deploy-vercel.sh --preview  # Deploy to preview
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$FRONTEND_DIR"

echo "=========================================="
echo "  YieldMind — Vercel Deployment"
echo "=========================================="

# Check prerequisites
if ! command -v npx &> /dev/null; then
  echo "❌ npx not found. Please install Node.js >= 18"
  exit 1
fi

# Install vercel CLI if not present
if ! npx vercel --version &> /dev/null 2>&1; then
  echo "📦 Installing Vercel CLI..."
  npm install -g vercel
fi

# Determine environment
if [[ "${1:-}" == "--preview" ]]; then
  echo "🚀 Deploying to PREVIEW environment..."
  npx vercel
else
  echo "🚀 Deploying to PRODUCTION environment..."
  npx vercel --prod
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Post-deployment checklist:"
echo "   1. Verify the deployment URL loads correctly"
echo "   2. Confirm wallet connection works (RainbowKit)"
echo "   3. Test API proxy (/api/* → backend)"
echo "   4. Check BSC testnet RPC connectivity"
echo ""
