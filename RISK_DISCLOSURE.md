# ⚠️ Risk Disclosure — YieldMind (TradeMind-AI)

---

## Important Notice

**YieldMind is a hackathon demonstration project.** It is designed for educational and showcase purposes only. This document outlines the risks associated with the project.

---

## General Risks

### 1. Software Risk
- This software has **NOT been professionally audited**
- Bugs, vulnerabilities, or unexpected behavior may exist
- Smart contracts are deployed on **BSC Testnet only** — NOT mainnet
- No guarantee of correctness, reliability, or availability

### 2. Financial Risk
- **Cryptocurrency trading involves substantial risk of loss**
- Past performance (simulated or real) does NOT guarantee future results
- Simulated PnL metrics may NOT reflect real market conditions
- Slippage, gas costs, and market impact are **estimated**, not real in dry-run mode

### 3. Strategy Risk
- All trading strategies are **rule-based heuristics**, not proven financial models
- The "Adaptive Strategy" uses simple exponential moving average weighting — NOT machine learning
- Signal generators use **proxy indicators** (e.g., volume spike = sentiment) — NOT direct sentiment analysis
- Strategies are designed for demonstration and may NOT perform in live markets

### 4. Smart Contract Risk
- Demo strategy contracts (`YieldStrategy.sol`) do NOT interact with real DeFi protocols
- Vault contracts are for BSC Testnet demonstration only
- Rebalancing logic is simulated — NOT based on real yield data
- Mainnet deployment requires professional security audit

### 5. Data Risk
- CoinMarketCap data requires a valid API key for live use
- Without API key, the system uses **synthetic fallback data** (simulated)
- Market data may be delayed, inaccurate, or unavailable
- Historical backtesting uses limited data and is NOT indicative of future performance

---

## Specific Risk Disclaimers

### Trading Signals
All 5 signal sources use **rule-based heuristics**:

| Signal | Method | Limitation |
|--------|--------|-----------|
| Technical | RSI proxy, momentum | Simplified indicators, not full technical analysis |
| Sentiment | Volume spike detection | Proxy only — NOT actual social/news sentiment |
| On-chain | Market cap categories | Heuristic grouping, NOT real on-chain analytics |
| Macro | Trend regime detection | Simplified bull/bear/ranging classification |
| Pattern | Multi-feature heuristic | Rule-based pattern matching, NOT ML/AI |

### Risk Management
The 5-layer risk management system is **simulated**:
- Emergency stops and circuit breakers are implemented in-memory
- No on-chain enforcement of risk limits
- Risk parameters are configurable and may be set incorrectly
- The system does NOT prevent all loss scenarios

### Smart Contracts
- Vault deposits/withdrawals work on testnet with test tokens only
- Strategy contracts are **demonstration implementations**
- Share-based accounting uses simplified BPS allocation
- No integration with real DeFi yield sources (PancakeSwap LP, Venus Lending are simulated)

---

## What This Project IS

✅ A hackathon demonstration of algorithmic DeFi concepts
✅ A fully functional pipeline (Signal → Strategy → Execution) in simulation
✅ A comprehensive test suite (27 contract tests + backend integration tests)
✅ A multi-layer risk management framework (demonstration)
✅ An open-source educational resource

## What This Project is NOT

❌ A production-ready trading system
❌ A financial advisory service
❌ A guarantee of profits or returns
❌ A substitute for professional financial advice
❌ An audited smart contract system

---

## Recommendations

1. **Do NOT invest real funds** based on this project's simulated results
2. **Consult a financial advisor** before any cryptocurrency investment
3. **Understand the risks** of DeFi and cryptocurrency trading
4. **Do your own research (DYOR)** on any protocol or strategy
5. **Start small** if experimenting with real funds (after audit)
6. **Never invest more than you can afford to lose**

---

## Regulatory Notice

- Cryptocurrency regulations vary by jurisdiction
- Users are responsible for compliance with local laws
- This project does NOT provide legal, tax, or financial advice
- DeFi protocols may be subject to regulatory changes

---

**Last Updated:** 2026-06-12
