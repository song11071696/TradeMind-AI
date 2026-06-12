# 🏆 Judge Quick Start — YieldMind (TradeMind-AI)

> **Track 1: Algorithmic Trading × BNB Chain × CoinMarketCap**

Welcome! This guide helps you quickly evaluate the YieldMind project.

---

## 🚀 Quick Setup (5 minutes)

```bash
# 1. Clone and install
git clone https://github.com/song11071696/TradeMind-AI.git
cd TradeMind-AI
cd contracts && npm install && cd ..
cd backend && npm install && cd ..

# 2. Run smart contract tests (27 tests)
cd contracts && npx hardhat test
# Expected: 27 passing ✅

# 3. Start backend (dry-run mode — no real funds)
cd backend && npm run dev
# → http://localhost:3001/api/health

# 4. Explore API endpoints
curl http://localhost:3001/api/health
curl http://localhost:3001/api/signals
curl http://localhost:3001/api/portfolio
curl http://localhost:3001/api/strategies
curl http://localhost:3001/api/risk
curl http://localhost:3001/api/pnl
curl http://localhost:3001/api/dca
curl http://localhost:3001/api/events
```

---

## 📋 What to Evaluate

### 1. Algorithmic Trading Pipeline

The system implements a **3-stage autonomous pipeline**:

```
Signal Fusion → Strategy Decision → Execution Engine
```

- **Signal Fusion**: 5 rule-based signal sources (Technical, Sentiment, On-chain, Macro, Pattern)
- **Strategy Decision**: Score-based strategy selection (Momentum, Mean Reversion, Adaptive)
- **Execution**: Dry-run simulation (default) or live BSC testnet execution

**Key API endpoints:**
- `GET /api/signals` — View signal weights, fusion history
- `GET /api/strategies` — View strategy decisions
- `GET /api/portfolio` — View positions and order queue

### 2. BNB Chain Integration

Smart contracts deployed on **BSC Testnet (Chain ID 97)**:

| Contract | Address |
|----------|---------|
| YieldMindCore | `0x7a7a523Cef7132ffA563B52Fba975D49E620C0a8` |
| YieldMindVault | `0x81cDC275bE14AB997a508D8ADB613Ff8a0B92a7d` |

**Test with:**
```bash
cd contracts && npx hardhat test
# 27/27 tests passing — covers deposits, withdrawals, strategies, emergency functions
```

### 3. CoinMarketCap Integration

- Real-time price, volume, market cap data from CMC API
- Feeds into 5 signal generators with caching and retry
- **Fallback simulation** when no API key is provided (for demo)

**Key API endpoint:**
- `GET /api/market/:symbol` — Real-time market data

### 4. Risk Management

**5-layer risk system** (fully functional):

| Layer | Protection |
|-------|-----------|
| 0: System | Emergency stop (20% drawdown), circuit breaker (3 failures) |
| 1: Portfolio | Max drawdown (15%), daily loss (5%), max positions (10) |
| 2: Position | Max size ($10K), min interval (60s) |
| 3: Rate Limit | 5 orders/min/symbol, 50 trades/day |
| 4: Correlation | Group-based correlation checks |

**Key API endpoint:**
- `GET /api/risk` — View risk state and limits

---

## 🔍 Architecture Highlights

| Component | Technology | Lines of Code |
|-----------|-----------|--------------|
| Smart Contracts | Solidity 0.8.24 + Hardhat | ~700 (4 contracts) |
| Signal Fusion | TypeScript (custom) | ~780 |
| Risk Manager | TypeScript (custom) | ~528 |
| DCA Strategy | TypeScript (custom) | ~511 |
| PnL Tracker | TypeScript (custom) | ~395 |
| Test Suite | JS + TS | ~972 (live tests) + 27 contract tests |
| Frontend | Next.js 14 + wagmi | Full DApp |

---

## ⚠️ Important Notes

1. **Default mode is dry-run** — no real transactions occur
2. **All strategies are demo/simulated** — implemented for hackathon demonstration
3. **Smart contracts on BSC Testnet** — NOT mainnet
4. **CMC fallback uses synthetic data** — add API key for real data
5. **Signal generators use rule-based heuristics** — NOT ML/AI

---

## 📚 Additional Documentation

| Document | Description |
|----------|------------|
| [README.md](README.md) | Full project documentation |
| [FEATURE_STATUS.md](FEATURE_STATUS.md) | Feature maturity classification |
| [SECURITY.md](SECURITY.md) | Security policy and protections |
| [RISK_DISCLOSURE.md](RISK_DISCLOSURE.md) | Risk disclaimers and limitations |
| [DEVELOPMENT_REPORT.md](DEVELOPMENT_REPORT.md) | Detailed development report |
| [docs/PITCH_DECK.md](docs/PITCH_DECK.md) | 12-page pitch deck |
| [docs/DEMO_VIDEO_SCRIPT.md](docs/DEMO_VIDEO_SCRIPT.md) | Demo video script |

---

**Built with ❤️ for the BNB Chain Hackathon — Track 1**
