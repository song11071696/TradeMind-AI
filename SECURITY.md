# 🔒 Security Policy — YieldMind (TradeMind-AI)

---

## Security Overview

YieldMind is a **hackathon demonstration project** built for the BNB Chain Hackathon (Track 1). It is NOT audited for production use.

---

## Smart Contract Security

### Implemented Protections

| Protection | Implementation | Status |
|-----------|---------------|--------|
| Access Control | OpenZeppelin AccessControl (4 roles) | ✅ |
| Reentrancy Guard | ReentrancyGuard on all state changes | ✅ |
| Emergency Pause | Guardian can pause/unpause | ✅ |
| Safe Transfers | SafeERC20 for all ERC20 operations | ✅ |
| Input Validation | Zero-address and zero-amount checks | ✅ |
| BPS Allocation | 10000 = 100% precision | ✅ |

### Known Limitations

- **No formal verification** — contracts are tested but not formally verified
- **No professional audit** — mainnet deployment requires external audit
- **Testnet only** — all deployments are on BSC Testnet (Chain ID 97)
- **Demo strategies** — YieldStrategy.sol is a simulated implementation, not production DeFi integration

---

## Backend Security

### Implemented Protections

| Protection | Implementation | Status |
|-----------|---------------|--------|
| 5-Layer Risk Management | System → Portfolio → Position → Rate → Correlation | ✅ |
| Emergency Stop | Auto-triggers on 20% drawdown or 10% daily loss | ✅ |
| Circuit Breaker | 3 consecutive failures → 5-minute cooldown | ✅ |
| Rate Limiting | 5 orders/min/symbol, 50 trades/day | ✅ |
| Dry-Run Default | No real transactions unless explicitly opted in | ✅ |
| Input Sanitization | Environment variable validation | ✅ |

### Environment Variables

**Never commit these to version control:**

| Variable | Sensitivity | Purpose |
|----------|------------|---------|
| `PRIVATE_KEY` | 🔴 CRITICAL | Wallet private key |
| `BSC_TESTNET_RPC` | 🟡 Medium | RPC endpoint URL |
| `BSCSCAN_API_KEY` | 🟡 Medium | Contract verification |
| `CMC_API_KEY` | 🟡 Medium | CoinMarketCap data access |

### .env Security

- `.env.example` is committed as a template (no secrets)
- `.env` must be created locally and is in `.gitignore`
- **Never share your private key** with anyone

---

## Reporting Vulnerabilities

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer privately (see LICENSE for contact)
3. Include a description, reproduction steps, and potential impact
4. Allow reasonable time for response before public disclosure

---

## Audit Recommendations (for Mainnet)

Before any mainnet deployment:

1. **Professional Smart Contract Audit** — by a recognized firm (CertiK, Trail of Bits, OpenZeppelin)
2. **Formal Verification** — critical functions (deposit, withdraw, rebalance)
3. **Bug Bounty Program** — incentivize responsible disclosure
4. **Insurance** — DeFi protocol insurance (Nexus Mutual, InsurAce)
5. **Multi-sig** — admin operations should use multi-signature wallets
6. **Timelock** — governance changes should have a timelock delay

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| OpenZeppelin | ^5.6.1 | Smart contract security primitives |
| Hardhat | ^2.22 | Development & testing framework |
| viem | latest | Type-safe chain interaction |
| Fastify | latest | API server |
| Next.js | 14 | Frontend framework |

---

**Last Updated:** 2026-06-12
