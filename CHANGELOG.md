# Changelog

All notable changes to YieldMind will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.2.0] - 2026-06-05 (Sprint Day 2 — Final)

### Added
- **Backend Unit Test Suite**: 51 Vitest tests across 3 files (`pnl-tracker.test.ts`, `risk-manager.test.ts`, `signal-fusion.test.ts`)
- **Vitest Configuration**: `backend/vitest.config.ts` for backend testing
- **Centralized Risk Config**: `backend/src/config/risk.ts` — single source of truth for all risk parameters
- **CMC Resilience Layer**: Retry with exponential backoff, circuit breaker pattern, response caching, graceful fallback simulation in `cmc.ts`
- **Fee Events**: `StrategyHarvested` event now emits performance fee amounts in `YieldMindCore.sol`
- **Vercel Deployment Config**: `frontend/vercel.json` + `VERCEL_DEPLOY.md` for frontend deployment
- **Testnet Swap Script**: `backend/src/tests/swap-testnet.js` — real PancakeSwap swap on BSC testnet
- **CHANGELOG.md**: This file
- **JUDGE_SUMMARY.md**: Comprehensive judge-facing summary with latest improvements
- **Track 1 Alignment Table**: README now includes explicit Track 1 requirement mapping

### Changed
- **README.md**: Updated with Track 1 alignment, BNB Chain and CMC references
- **HACKATHON_SUBMISSION.md**: Updated with latest improvements, test coverage stats, and chain deployment details
- **Risk Manager**: Refactored to use centralized config from `config/risk.ts`
- **CMC Data Source**: Complete rewrite with 288 lines of resilient data fetching
- **Execution Engine**: Minor improvements to trade execution flow
- **PnL Tracker**: Added fee tracking support

### Fixed
- **Security**: Removed hardcoded API keys from source, updated `.gitignore`
- **Rebalance Sync**: Fixed state synchronization during portfolio rebalance
- **Emergency Withdraw**: Fixed emergency withdrawal flow
- **Approve Security**: Improved token approval security patterns
- **SELL Position**: Fixed sell position handling in execution engine

---

## [2.1.0] - 2026-06-05 (Sprint Day 1)

### Added
- **BSC Testnet Deployment**: 5 contracts deployed and verified on BSCScan
  - MockERC20: `0x1a50060f1C8E2bC4964afAAc08e4aB439E72D6A9`
  - YieldMindCore: `0x7a7a523Cef7132ffA563B52Fba975D49E620C0a8`
  - YieldMindVault: `0x81cDC275bE14AB997a508D8ADB613Ff8a0B92a7d`
  - YieldStrategy (PancakeSwap): `0x16cCf218574dE3cbe55e76E066A70bAb60853a90`
  - YieldStrategy (Venus): `0xCcf7D61c591036008b6f8E93375A190C418Ed63e`
- **Contract Deployment Record**: `contracts/deployments/bscTestnet.json`
- **Demo Script**: `docs/DEMO_VIDEO_SCRIPT.md` — 7-scene demo video script
- **Audit Report**: `docs/AUDIT_REPORT.md` — comprehensive security audit
- **Project Logo & Screenshots**: Visual assets for presentation

### Changed
- **README.md**: Added BSC testnet deployment table, updated Quick Start
- **Smart Contracts**: Security fixes and improvements

### Fixed
- **Rebalance**: Fixed portfolio rebalance logic
- **SELL Position**: Corrected sell position handling
- **Security Cleanup**: Various security improvements

---

## [2.0.0] - 2026-06-05 (TradeMind AI v2.0.0)

### Added
- **Autonomous AI Agent System**: Complete 3-stage pipeline
  - Signal Fusion Engine (780 lines) — 5 signal generators with adaptive weights
  - Strategy Decision Engine (409 lines) — 3 strategies with risk-adjusted sizing
  - Execution Engine (386 lines) — dry-run + live PancakeSwap execution
- **Multi-Layer Risk Manager** (528 lines): 5-layer defense
  - System-level: emergency stop, circuit breaker
  - Portfolio-level: drawdown, daily loss, position limits
  - Position-level: size limits, min intervals
  - Rate limiting: per-symbol, daily limits
  - Correlation checks: grouped exposure limits
- **PnL Tracker** (395 lines): Sharpe ratio, profit factor, max drawdown, win rate
- **BNB Chain Client**: viem-based chain integration with PancakeSwap Router
- **EventBus**: Typed pub/sub event system for agent communication
- **CMC Data Source** (195 lines): CoinMarketCap API integration
- **Adaptive DCA Strategy** (511 lines): 6-level price-drop triggers, progressive sizing
- **API Routes** (187 lines): 15+ REST endpoints for full observability
- **Type System**: 30+ TypeScript interfaces
- **Live Test Suite** (972 lines): BSC testnet end-to-end tests
- **Backend Configuration**: Environment-based config with validation

### Changed
- **Project Architecture**: Evolved from simple vault to full AI agent system
- **README.md**: Complete rewrite with AI agent pipeline documentation
- **DEVELOPMENT_REPORT.md**: Updated with v2.0 architecture

---

## [1.0.0] - 2026-06-04 (Initial Release)

### Added
- **Smart Contracts**: YieldMindCore.sol (469 lines), YieldStrategy.sol, YieldMindVault.sol
- **Test Suite**: 27 test cases covering all contract functionality
- **Frontend DApp**: Next.js 14 with wagmi + RainbowKit
- **Contract Interface**: IYieldStrategy.sol standard interface
- **Mock Token**: MockERC20.sol for testing
- **Deployment Script**: `contracts/scripts/deploy.js`
- **README.md**: Initial project documentation
- **MIT License**

---

[2.2.0]: https://github.com/song11071696/TradeMind-AI/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/song11071696/TradeMind-AI/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/song11071696/TradeMind-AI/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/song11071696/TradeMind-AI/releases/tag/v1.0.0
