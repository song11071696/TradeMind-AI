# 🧠 YieldMind (by TradeMind-AI)

> **Algorithmic DeFi Yield Optimization & Autonomous Trading System on BNB Chain**

> **Repo name:** `TradeMind-AI` · **Product name:** `YieldMind`

---

### 🏁 Track 1 — Algorithmic Trading × BNB Chain × CoinMarketCap

| Requirement | YieldMind Implementation |
|-------------|--------------------------|
| **Algorithmic Trading Agent** | 3-stage autonomous pipeline: Signal Fusion → Strategy Decision → Execution Engine, communicating via typed EventBus. Rule-based signal weighting, heuristic divergence detection, and multi-layer risk management. |
| **BNB Chain** | Smart contracts (YieldMindCore, YieldStrategy) deployed on BSC testnet (Chain ID 97). Live PancakeSwap Router integration for DEX execution. viem-based chain client with gas monitoring. |
| **CMC Data** | CoinMarketCap API integration for real-time market data (prices, volume, market cap). Feeds into 5 signal generators with caching, retry/backoff, and circuit breaker resilience. |

**Why Track 1?** YieldMind is an **autonomous algorithmic trading system** that ingests real-time CMC market data, fuses 5 independent rule-based signal sources with adaptive weighting, makes risk-adjusted strategy decisions, and executes trades on BNB Chain via PancakeSwap — all with 5-layer risk protection and on-chain vault smart contracts.

---

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat&logo=solidity)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22-fff400?style=flat)](https://hardhat.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![BNB Chain](https://img.shields.io/badge/BNB%20Chain-F0B90B?style=flat&logo=binance)](https://www.bnbchain.org/)

---

## 🎯 Overview

YieldMind is an **algorithmic autonomous trading system** and **DeFi yield optimizer** on BNB Chain. The system combines a multi-stage algorithmic pipeline with on-chain smart contracts to deliver rule-based DeFi portfolio management.

### 💡 Key Innovation

- **Multi-Stage Algorithmic Pipeline**: Three-stage architecture (Signal Fusion → Strategy Decision → Execution) with event-driven pub/sub communication
- **5-Factor Signal Fusion**: Technical, Sentiment, On-chain, Macro, and Pattern signals with rule-based adaptive weight learning
- **Multi-Layer Risk Management**: 5-layer risk guard (System → Portfolio → Position → Rate Limit → Correlation) with circuit breakers and emergency stops
- **Adaptive DCA Strategy**: Price-drop triggers, progressive sizing, signal-aware pause/resume
- **On-chain Vault System**: Solidity smart contracts with role-based access control, reentrancy protection, and emergency mechanisms
- **Real-Time Market Data**: CoinMarketCap integration with caching and fallback simulation

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       User Layer                          │
│   Web DApp (Next.js)  │  REST API  │  Real-time Events   │
└────────────────────────┬─────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Fastify API Gateway (TypeScript)              │
│   /api/health │ /api/signals │ /api/portfolio │ /api/risk │
│   /api/pnl    │ /api/strategies │ /api/dca │ /api/market  │
└────────────────────────┬─────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│          Algorithmic Pipeline (Event-Driven)               │
│                                                            │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │   Signal     │──▶│   Strategy   │──▶│  Execution   │   │
│  │   Fusion     │   │   Decision   │   │   Engine     │   │
│  │   Engine     │   │   Engine     │   │              │   │
│  └──────┬──────┘   └──────┬───────┘   └──────────────┘   │
│         │                  │                               │
│  5 Signal Sources:    3 Strategies:      Modes (default=dry-run):│
│  • Technical          • Momentum         • Dry Run         │
│  • Sentiment          • Mean Reversion   • Live (BSC)      │
│  • On-chain           • Adaptive         • PancakeSwap     │
│  • Macro                                       Router      │
│  • Pattern                                                     │
│         │                  │                               │
│  ┌──────┴──────┐   ┌──────┴───────┐                       │
│  │  Adaptive   │   │    Risk      │                       │
│  │  Weights    │   │   Manager    │                       │
│  │  Learning   │   │  (5 Layers)  │                       │
│  └─────────────┘   └──────────────┘                       │
└────────────────────────┬──────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│            Smart Contracts (BNB Chain / BSC)               │
│   YieldMindCore │ YieldStrategy │ IYieldStrategy          │
│   ├── AccessControl (4 roles: Admin, Manager, Harvester,  │
│   │                  Guardian)                             │
│   ├── ReentrancyGuard │ Pausable │ SafeERC20              │
│   └── Share-based vault with BPS allocation system         │
└──────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
TradeMind-AI/
├── contracts/                         # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── YieldMindCore.sol          # Core vault contract (469 lines)
│   │   ├── YieldMindVault.sol         # Simple vault implementation
│   │   ├── YieldStrategy.sol          # Yield strategy base implementation
│   │   ├── interfaces/
│   │   │   └── IYieldStrategy.sol     # Strategy interface
│   │   └── mocks/
│   │       └── MockERC20.sol          # Test token
│   ├── test/
│   │   └── YieldMindCore.test.js      # 27 test cases
│   ├── scripts/
│   │   └── deploy.js                  # Deployment script
│   └── hardhat.config.js
├── frontend/                          # Next.js 14 frontend
│   ├── vercel.json                    # Vercel deployment configuration
│   ├── DEPLOY_VERCEL.md              # Vercel deployment guide
│   ├── scripts/
│   │   └── deploy-vercel.sh          # Vercel deployment script
│   └── src/
│       ├── app/                       # App router pages
│       ├── components/
│       │   ├── VaultInterface.tsx     # Main vault UI
│       │   └── Providers.tsx          # Web3 providers
│       └── config/
│           ├── contracts.ts           # Contract ABIs
│           └── wagmi.ts              # Web3 config
├── backend/                           # Autonomous Trading Agent (Fastify + TypeScript)
│   └── src/
│       ├── index.ts                   # Main entry — wires all agents + API
│       ├── config/index.ts            # Configuration loader & validator
│       ├── types/index.ts             # Full type system (30+ interfaces)
│       ├── agents/
│       │   ├── signal-fusion/index.ts # Signal Fusion Engine (780 lines)
│       │   │                          #   - 5 signal generators
│       │   │                          #   - Adaptive weight learning
│       │   │                          #   - Time-decay weighting
│       │   │                          #   - Signal divergence detection
│       │   │                          #   - Historical outcome tracking
│       │   ├── strategy-decision/     # Strategy Decision Engine
│       │   │   └── index.ts           #   - Strategy selection & scoring
│       │   │                          #   - Risk-adjusted position sizing
│       │   │                          #   - Stop-loss / take-profit calc
│       │   └── execution/index.ts     # Execution Engine
│       │                              #   - Dry run simulation
│       │                              #   - Live BSC execution (PancakeSwap)
│       │                              #   - Slippage protection
│       │                              #   - Portfolio tracking
│       ├── core/
│       │   ├── event-bus.ts           # Pub/Sub event system
│       │   ├── risk-manager.ts        # Multi-layer risk management (528 lines)
│       │   │                          #   - System-level (emergency stop, circuit breaker)
│       │   │                          #   - Portfolio-level (drawdown, daily loss)
│       │   │                          #   - Position-level (size limits, min intervals)
│       │   │                          #   - Rate limiting (per-symbol, daily)
│       │   │                          #   - Correlation checks
│       │   ├── pnl-tracker.ts         # PnL tracking & metrics (395 lines)
│       │   │                          #   - Realized/unrealized PnL
│       │   │                          #   - Sharpe ratio, profit factor
│       │   │                          #   - Max drawdown tracking
│       │   │                          #   - Daily/weekly PnL snapshots
│       │   └── bnb-chain.ts           # BNB Chain integration (viem)
│       │                              #   - PancakeSwap Router reads
│       │                              #   - ERC20 balance queries
│       │                              #   - Gas price monitoring
│       ├── data-sources/
│       │   └── cmc.ts                 # CoinMarketCap data source
│       ├── strategies/
│       │   └── dca.ts                 # Adaptive DCA strategy (511 lines)
│       │                              #   - Time-based DCA
│       │                              #   - Price-drop triggers with progressive sizing
│       │                              #   - Take-profit / stop-loss
│       │                              #   - Signal-aware pause/resume
│       ├── api/
│       │   └── routes.ts              # 15+ REST API endpoints
│       ├── scripts/
│       │   └── register-agent.ts       # ERC-8004 agent identity registration (demo)
│       └── tests/
│           └── live-test.ts           # BSC testnet live test suite (972 lines)
├── docs/
│   ├── 技术架构设计文档.md              # Technical architecture doc
│   ├── PITCH_DECK.md                  # 12-page pitch deck
│   └── DEMO_VIDEO_SCRIPT.md           # 7-scene demo video script
│   └── HACKATHON_SUBMISSION.md        # Submission checklist
├── deployments/                         # Deployment records
│   └── agent-registration.json         # ERC-8004 agent registration record
├── DEVELOPMENT_REPORT.md              # Detailed development report
├── .env.example                       # Environment variables template
└── LICENSE                            # MIT License
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18
- **npm** or **yarn**
- **Git**

### 1. Clone & Install

```bash
git clone https://github.com/song11071696/TradeMind-AI.git
cd TradeMind-AI

# Install contract dependencies
cd contracts && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install backend dependencies
cd backend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values:
# - PRIVATE_KEY: Wallet private key
# - BSC_TESTNET_RPC: BSC testnet RPC URL
# - BSCSCAN_API_KEY: For contract verification
# - CMC_API_KEY: (optional) CoinMarketCap API key for live market data
```

### 3. Compile & Test Contracts

```bash
cd contracts
npx hardhat compile          # Compile contracts
npx hardhat test             # Run 27 test cases (all passing ✅)
npx hardhat coverage         # Generate coverage report
```

### 4. Deploy to BSC Testnet

```bash
cd contracts
npx hardhat run scripts/deploy.js --network bscTestnet
```

### BSC Testnet Deployment (2026-06-05)

| Contract | Address | BSCScan |
|----------|---------|---------|
| **MockERC20 (Test USDT)** | [`0x1a50060f1C8E2bC4964afAAc08e4aB439E72D6A9`](https://testnet.bscscan.com/address/0x1a50060f1C8E2bC4964afAAc08e4aB439E72D6A9) | ✅ |
| **YieldMindCore** | [`0x7a7a523Cef7132ffA563B52Fba975D49E620C0a8`](https://testnet.bscscan.com/address/0x7a7a523Cef7132ffA563B52Fba975D49E620C0a8) | ✅ |
| **YieldMindVault** | [`0x81cDC275bE14AB997a508D8ADB613Ff8a0B92a7d`](https://testnet.bscscan.com/address/0x81cDC275bE14AB997a508D8ADB613Ff8a0B92a7d) | ✅ |
| **YieldStrategy (PancakeSwap LP)** | [`0x16cCf218574dE3cbe55e76E066A70bAb60853a90`](https://testnet.bscscan.com/address/0x16cCf218574dE3cbe55e76E066A70bAb60853a90) | ✅ |
| **YieldStrategy (Venus Lending)** | [`0xCcf7D61c591036008b6f8E93375A190C418Ed63e`](https://testnet.bscscan.com/address/0xCcf7D61c591036008b6f8E93375A190C418Ed63e) | ✅ |

**Deployer:** `0x7FA44ffc5b7652d8E45B421e7361F51f6f08b93D`
**Network:** BSC Testnet (Chain ID: 97)
**Timestamp:** 2026-06-05T02:29:46Z

### 5. Start the Algorithmic Trading System & Frontend

```bash
# Terminal 1: Backend Algorithmic Trading System
cd backend && npm run dev    # → http://localhost:3001
                             #   Starts: Signal Fusion, Strategy Decision,
                             #   Execution Engine, Risk Manager, PnL Tracker,
                             #   DCA Strategy, and API Server

# Terminal 2: Frontend DApp
cd frontend && npm run dev   # → http://localhost:3000
```

### 6. Run Backend Live Tests (BSC Testnet)

```bash
cd backend && npx tsx src/tests/live-test.ts
```

---

## 🤖 Algorithmic Pipeline

### Signal Fusion Engine

The first stage of the pipeline generates trading signals from 5 independent rule-based perspectives:

| Signal Source | Weight | Description |
|--------------|--------|-------------|
| **Technical** | 30% | RSI proxy, momentum (24h/7d), volume factor, volatility |
| **Sentiment** | 12% | Volume spike detection, volume-to-marketcap ratio |
| **On-chain** | 25% | Market cap category analysis, whale activity proxy (heuristic) |
| **Macro** | 18% | Trend regime detection (bull/bear/ranging), fear/greed proxy |
| **Pattern** | 15% | Moving average crossovers, price momentum patterns |

**Key Features:**
- **Adaptive Weight Learning**: Weights adjust based on historical signal accuracy (5% adaptation rate) using simple exponential moving average
- **Time-Decay Weighting**: Recent signals weighted higher (0.95 decay/min)
- **Signal Divergence Detection**: Alerts when signals strongly disagree
- **Composite Scoring**: Weighted fusion with confidence and risk assessment

### Strategy Decision Engine

Takes fused signals and determines optimal trade actions:

| Strategy | Type | Best For |
|----------|------|----------|
| Momentum | `momentum` | Strong directional signals, trending markets |
| Mean Reversion | `mean_reversion` | Extreme signals, high volatility |
| Adaptive | `adaptive` | General purpose, risk-adjusted |

**Decision Process:**
1. Score each strategy against signal characteristics
2. Select best-matching strategy
3. Calculate risk-adjusted position size
4. Set stop-loss and take-profit levels
5. Generate trade order with slippage protection

### Execution Engine

Executes orders on DEX venues:

- **Dry Run Mode** (DEFAULT): Simulated execution with realistic slippage and gas costs — no real funds at risk
- **Live Mode**: Real transactions via PancakeSwap Router on BSC
- **⚠️ Live mode requires explicit opt-in** via `EXECUTION_MODE=live` in `.env`
- **Portfolio Tracking**: Automatic position management (averaging in/out)
- **Event Emission**: `order.filled` / `order.failed` events for downstream tracking

---

## 🛡️ Multi-Layer Risk Management

```
Layer 0: System-Level
├── Emergency Stop (20% drawdown / 10% daily loss triggers)
└── Circuit Breaker (3 consecutive failures → 5min cooldown)

Layer 1: Portfolio-Level
├── Max Drawdown (15% limit)
├── Daily Loss (5% limit)
├── Max Open Positions (10)
└── Balance Sufficiency Check

Layer 2: Position-Level
├── Max Position Size ($10,000)
├── Aggregate Position Check
└── Min Time Between Trades (60s)

Layer 3: Rate Limiting
├── Max Orders per Minute (5 per symbol)
└── Max Daily Trades (50)

Layer 4: Correlation Checks
├── Correlation Groups (Layer1, DeFi, Stablecoins)
├── Max Correlated Positions (3)
└── Max Correlation Exposure (40%)
```

---

## 📊 Adaptive DCA Strategy

| Feature | Description |
|---------|-------------|
| Time-based DCA | Configurable intervals (default: 30 min for demo) |
| Price-Drop Triggers | 6 levels: -2%, -5%, -8%, -12%, -18%, -25% |
| Progressive Sizing | Multipliers: 1.0x, 1.3x, 1.6x, 2.0x, 2.5x, 3.0x |
| Take Profit | 6% default target |
| Stop Loss | 20% from average entry |
| Signal Awareness | Pauses DCA during strong downtrend signals |

---

## 📜 Smart Contracts

### YieldMindCore.sol — Core Vault

The main entry point for user deposits and strategy management (469 lines).

| Feature | Description |
|---------|-------------|
| `deposit(amount)` | Deposit tokens, receive vault shares |
| `withdraw(shares)` | Redeem shares, withdraw tokens |
| `addStrategy(...)` | Register a new yield strategy |
| `rebalance(allocations)` | Signal-triggered portfolio rebalancing |
| `harvest(strategy)` | Collect rewards from a strategy |
| `pause() / unpause()` | Emergency circuit breaker |

**Security Features:**
- 🔒 Role-based access control (Admin, Strategy Manager, Harvester, Guardian)
- 🛡️ ReentrancyGuard on all state-changing functions
- ⏸️ Pausable for emergency stops
- ✅ SafeERC20 for all token transfers
- 📊 BPS allocation system (10000 = 100%)

### YieldStrategy.sol — Strategy Implementation (Demo/Simulated)

Base strategy contract (demo/simulated for hackathon) that interacts with underlying DeFi protocols.

| Feature | Description |
|---------|-------------|
| `deposit(amount)` | Stake tokens in strategy |
| `withdraw(shares)` | Unstake and return tokens |
| `harvest()` | Claim and compound rewards |
| `updateAPY(newAPY)` | Oracle-driven APY update |
| Performance fee | 1% default, configurable |

### IYieldStrategy.sol — Interface

Standardized interface for all yield strategies, enabling plug-and-play strategy modules.

---

## 🧪 Testing

### Smart Contract Tests

```bash
cd contracts && npx hardhat test
```

**Test Coverage (27/27 passing ✅):**

| Module | Tests | Status |
|--------|-------|--------|
| Deployment | 3 | ✅ |
| Strategy Management | 5 | ✅ |
| Deposits | 5 | ✅ |
| Withdrawals | 4 | ✅ |
| Harvest | 2 | ✅ |
| Rebalance | 2 | ✅ |
| Emergency Functions | 3 | ✅ |
| View Functions | 3 | ✅ |
| **Total** | **27** | **✅ All Passing** |

### Backend Live Tests

```bash
cd backend && npx tsx src/tests/live-test.ts
```

Tests BSC testnet connectivity, PnL tracker, risk manager, and simulated trade execution.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health + agent status |
| GET | `/api/signals` | Signal buffer, weights, fusion history |
| GET | `/api/strategies` | Active strategies + decision history |
| GET | `/api/portfolio` | Portfolio state, positions, order queue |
| GET | `/api/pnl` | PnL metrics, trade history, snapshots |
| GET | `/api/pnl/metrics` | Sharpe ratio, win rate, profit factor |
| GET | `/api/pnl/snapshots` | Historical portfolio snapshots |
| GET | `/api/pnl/trades` | Trade records |
| GET | `/api/risk` | Risk state, limits, trading status |
| POST | `/api/risk/emergency-stop/clear` | Clear emergency stop |
| POST | `/api/risk/config` | Update risk configuration |
| GET | `/api/dca` | All DCA strategy states |
| GET | `/api/dca/:symbol` | DCA state for specific symbol |
| POST | `/api/dca/:symbol/activate` | Activate DCA for symbol |
| POST | `/api/dca/:symbol/deactivate` | Deactivate DCA for symbol |
| GET | `/api/market/:symbol` | Real-time market data (CMC) |
| GET | `/api/market` | Top 20 cryptos |
| GET | `/api/events` | Event bus log (filterable) |
| GET | `/api/config` | System configuration |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Solidity 0.8.24 + Hardhat | On-chain vault & strategy logic |
| **Security** | OpenZeppelin 5.6 | Access control, guards |
| **Frontend** | Next.js 14 + wagmi + RainbowKit | Web DApp |
| **Styling** | Tailwind CSS | UI framework |
| **Backend** | Fastify + TypeScript | High-performance API server |
| **Algorithmic Engine** | Custom multi-stage pipeline | Signal fusion + decision + execution |
| **Data** | CoinMarketCap API | Real-time market data |
| **Chain Client** | viem | BNB Chain interaction (PancakeSwap Router) |
| **Event System** | Custom EventBus (pub/sub) | Agent-to-agent communication |
| **Network** | BNB Chain (BSC) | Target blockchain |

---

## 🗺️ Roadmap

- [x] Core smart contracts (YieldMindCore, YieldStrategy)
- [x] Comprehensive test suite (27 test cases)
- [x] Frontend DApp with wallet integration
- [x] **Autonomous Algorithmic Trading System** (Signal Fusion + Strategy Decision + Execution)
- [x] **Multi-Layer Risk Manager** (5 layers with circuit breakers)
- [x] **PnL Tracking System** (Sharpe ratio, drawdown, win rate)
- [x] **Adaptive DCA Strategy** (price-drop triggers, signal-aware)
- [x] **CoinMarketCap integration** with live market data
- [x] **BSC testnet live test suite** (972 lines)
- [x] BSC testnet deployment & contract verification
- [ ] Chainlink oracle integration for live on-chain APY data
- [ ] LLM integration for natural language strategy description (planned)
- [ ] Multi-chain support (Ethereum, Polygon, Arbitrum)
- [ ] Governance token (YMD) and DAO

---

## 🔐 Security

**Smart Contracts:**
- **Access Control**: OpenZeppelin AccessControl with 4 distinct roles
- **Reentrancy Protection**: ReentrancyGuard on all external state changes
- **Emergency Mechanism**: Guardian can pause/unpause and trigger emergency withdrawals
- **Safe Transfers**: SafeERC20 for all ERC20 operations
- **Input Validation**: Zero-address and zero-amount checks throughout

**Algorithmic Trading System:**
- **5-Layer Risk Management**: System → Portfolio → Position → Rate Limit → Correlation
- **Emergency Stop**: Auto-triggers on 20% drawdown or 10% daily loss
- **Circuit Breaker**: 3 consecutive failures → 5-minute cooldown
- **Rate Limiting**: Max 5 orders/minute per symbol, 50 trades/day
- **Dry Run Mode**: Default execution mode for safety

> ⚠️ This project is built for hackathon demonstration. A professional security audit is recommended before any mainnet deployment.

---

## ⚠️ Financial Disclaimer

> **This software is for educational and hackathon demonstration purposes only.** It does NOT constitute financial advice, investment advice, trading advice, or any other sort of professional advice. You should not treat any of the content as such.
>
> - **No real funds** are used in the default (dry-run) mode.
> - All smart contract deployments are on **BSC Testnet** (Chain ID 97), not mainnet.
> - Trading strategies, signals, and PnL metrics are **simulated** and may not reflect real market conditions.
> - Past performance (simulated or real) does not guarantee future results.
> - **Always do your own research (DYOR)** before making any financial decisions.
> - The developers assume no responsibility for any financial losses incurred.

---

## 🔑 API Authentication

The backend API runs locally by default (localhost:3001). For production deployment:
- Implement API key authentication via `API_KEY` environment variable
- Rate limiting is built-in at the application level (5 requests/second default)
- CORS is configured for the frontend origin
- **Never expose your private key or API keys** — use environment variables only

---

## 🔒 Default Safety Mode

YieldMind ships with **dry-run mode enabled by default**. In this mode:
- All trades are **simulated locally** — no on-chain transactions occur
- Slippage and gas costs are **estimated**, not real
- Portfolio tracking reflects simulated PnL only
- To enable live trading, set `EXECUTION_MODE=live` in `.env` (not recommended for production without audit)

> **Strategy contracts (`YieldStrategy.sol`) are demo/simulated implementations** deployed on BSC testnet for hackathon demonstration. They do NOT represent production-ready DeFi strategies.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [OpenZeppelin](https://www.openzeppelin.com/) — Secure smart contract libraries
- [Hardhat](https://hardhat.org/) — Ethereum development environment
- [BNB Chain](https://www.bnbchain.org/) — Target blockchain
- [CoinMarketCap](https://coinmarketcap.com/) — Market data API
- [PancakeSwap](https://pancakeswap.finance/) — DEX on BNB Chain
- [RainbowKit](https://www.rainbowkit.com/) — Wallet connection UI
- [viem](https://viem.sh/) — Type-safe Ethereum library
- [BNB Agent SDK](https://github.com/bnb-chain/bnb-agent-sdk) — BNB Chain AI Agent development toolkit

---

## 📊 CMC Skills Integration

YieldMind is built to be **fully compatible with the official [CMC Skills](https://coinmarketcap.com/developer/)** ecosystem provided by CoinMarketCap.

### Data Sources & Compatibility

| Component | CMC Data Used | Skills Compatibility |
|-----------|--------------|---------------------|
| **Signal Fusion Engine** | Real-time prices, 24h volume, market cap, percent change | ✅ Uses standard CMC `/v1/cryptocurrency/quotes/latest` endpoint |
| **Technical Signal Generator** | Price momentum, volume factor, volatility metrics | ✅ Compatible with CMC Skills market data format |
| **Sentiment Signal Generator** | Volume spikes, volume-to-marketcap ratio | ✅ Uses CMC aggregated volume data |
| **On-chain Signal Generator** | Market cap categories, circulating supply | ✅ Compatible with CMC metadata endpoints |
| **Macro Signal Generator** | Total market cap, BTC dominance, trend regime | ✅ Uses CMC global metrics (`/v1/global-metrics/quotes/latest`) |
| **Adaptive DCA Strategy** | Real-time price feeds for drop triggers | ✅ Consumes CMC Skills price data |

### Architecture

```
CoinMarketCap API ──→ CMC Data Source (data-sources/cmc.ts)
                           │
                           ├── Caching layer (60s TTL)
                           ├── Circuit breaker (3 failures → fallback)
                           └── Retry with exponential backoff
                           │
                           ▼
                     Signal Fusion Engine
                     (5 independent generators)
```

### CMC API Endpoints Used

- **`/v1/cryptocurrency/quotes/latest`** — Real-time price, volume, market cap
- **`/v1/cryptocurrency/listings/latest`** — Top N crypto rankings
- **`/v1/global-metrics/quotes/latest`** — Global market metrics
- **`/v1/cryptocurrency/info`** — Token metadata & categories

> 💡 The project supports both **live CMC API** (with `CMC_API_KEY`) and a **simulation fallback** (synthetic data generation) for development/testing without an API key. When no API key is configured, the system automatically uses simulated market data.

---

## 🆔 Agent Identity Registration (ERC-8004)

YieldMind registers its trading agent on-chain using the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Agent Identity standard, providing verifiable on-chain provenance.

### Register the Agent

```bash
cd backend

# Set your private key in .env first
npx tsx src/scripts/register-agent.ts
```

The script will:
1. Connect to BSC testnet via viem
2. Call the ERC-8004 registry contract to register the agent identity
3. Save the registration record (tx hash, block number, agent metadata) to `deployments/agent-registration.json`

> 📝 If the ERC-8004 registry contract is not yet deployed on BSC testnet, the script falls back to a self-registration approach using a calldata memo transaction.

---

**Built with ❤️ for the BNB Chain Hackathon — Track 1: Algorithmic Trading × BNB Chain × CoinMarketCap**
