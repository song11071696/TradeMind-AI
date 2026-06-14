// ============================================================
// TradeMind AI - Execution Engine (Agent)
// ============================================================
// Executes trade orders on DEX venues (PancakeSwap, etc.)
// with slippage protection, gas optimization, and error recovery.
// ============================================================
import { randomUUID } from 'crypto';
import type { Hash } from 'viem';
import type {
  TradeOrder,
  OrderStatus,
  ExecutionVenue,
  PortfolioState,
  Position,
  AgentConfig,
  AgentState,
  BNBChainConfig,
} from '../../types';
import { eventBus } from '../../core/event-bus';
import { BNBChainClient, BSC_TOKENS } from '../../core/bnb-chain';

interface ExecutionResult {
  success: boolean;
  orderId: string;
  txHash?: string;
  executedPrice?: number;
  executedQuantity?: number;
  gasUsed?: number;
  error?: string;
}

export class ExecutionEngine {
  private config: AgentConfig;
  private state: AgentState;
  private chainClient: BNBChainClient | null = null;
  private orderQueue: TradeOrder[] = [];
  private executionHistory: ExecutionResult[] = [];
  private portfolio: PortfolioState;
  private processingTimes: number[] = [];
  private isDryRun: boolean;

  constructor(chainConfig?: BNBChainConfig, options?: { dryRun?: boolean }) {
    this.config = {
      id: 'execution-engine',
      name: 'Execution Engine',
      version: '2.0.0',
      interval: 5000,
      enabled: true,
    };

    this.state = {
      status: 'idle',
      lastRun: 0,
      metrics: {
        totalRuns: 0,
        successRate: 1.0,
        avgProcessingTime: 0,
        lastProcessingTime: 0,
      },
    };

    this.isDryRun = options?.dryRun ?? true; // Default to dry run for safety

    if (chainConfig) {
      this.chainClient = new BNBChainClient(chainConfig);
    }

    this.portfolio = {
      totalValue: 100000, // Starting with $100k for simulation
      positions: [],
      availableBalance: 100000,
      totalPnl: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Start the execution engine
   */
  start(): void {
    this.state.status = 'idle';

    // NOTE: strategy.decision subscription removed from here.
    // Orders are now queued exclusively through the risk-gated
    // subscription in backend/src/index.ts, which runs risk checks
    // via RiskManager.checkOrder() before calling queueOrder().
    // This prevents duplicate execution and ensures all orders
    // pass through the multi-layer risk management system.

    // Start order processing loop
    this.startProcessingLoop();

    console.log(
      `[${this.config.name}] Started ` +
      `(mode: ${this.isDryRun ? 'DRY RUN' : 'LIVE'}, ` +
      `chain: ${this.chainClient ? 'connected' : 'simulated'}, ` +
      `wallet: ${this.chainClient?.getWalletAddress() ?? 'none'})`
    );
  }

  /**
   * Queue an order for execution
   */
  queueOrder(order: TradeOrder): void {
    this.orderQueue.push(order);
    console.log(
      `[${this.config.name}] Order queued: ${order.side} ${order.symbol} ` +
      `(${order.type}, qty: ${order.quantity.toFixed(2)})`
    );
  }

  /**
   * Start the order processing loop
   */
  private startProcessingLoop(): void {
    setInterval(async () => {
      if (this.state.status === 'processing' || this.orderQueue.length === 0) return;

      const order = this.orderQueue.shift();
      if (!order) return;

      await this.executeOrder(order);
    }, this.config.interval);
  }

  /**
   * Execute a single order
   */
  private async executeOrder(order: TradeOrder): Promise<ExecutionResult> {
    const start = Date.now();
    this.state.status = 'processing';

    try {
      console.log(
        `[${this.config.name}] Executing: ${order.side} ${order.symbol} ` +
        `via ${order.venue} (${this.isDryRun ? 'DRY RUN' : 'LIVE'})`
      );

      let result: ExecutionResult;

      if (this.isDryRun) {
        result = await this.simulateExecution(order);
      } else {
        result = await this.liveExecution(order);
      }

      // Update order status
      order.status = result.success ? 'FILLED' : 'FAILED';
      order.executedAt = Date.now();
      order.executedPrice = result.executedPrice;
      order.executedQuantity = result.executedQuantity;
      order.txHash = result.txHash;
      order.gasUsed = result.gasUsed;

      // Update portfolio if successful
      if (result.success) {
        this.updatePortfolio(order);
      }

      this.executionHistory.push(result);
      if (this.executionHistory.length > 1000) {
        this.executionHistory = this.executionHistory.slice(-500);
      }

      // Emit event
      await eventBus.emit({
        type: result.success ? 'order.filled' : 'order.failed',
        payload: { order, result },
        timestamp: Date.now(),
        source: this.config.id,
      });

      // Emit fee.charged event on successful fill
      if (result.success) {
        const gasFee = (result.gasUsed || 0) * 0.000000005; // BNB gas cost estimate
        const platformFee = (result.executedPrice || 0) * (result.executedQuantity || 0) * 0.001; // 0.1% platform fee
        await eventBus.emit({
          type: 'fee.charged',
          payload: {
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            gasFee,
            platformFee,
            totalFee: gasFee + platformFee,
            gasUsed: result.gasUsed,
            txHash: result.txHash,
          },
          timestamp: Date.now(),
          source: this.config.id,
        });
      }

      console.log(
        `[${this.config.name}] ${result.success ? '✅ Filled' : '❌ Failed'}: ` +
        `${order.side} ${order.symbol} @ $${result.executedPrice?.toFixed(4) || 'N/A'} ` +
        `${result.txHash ? `(tx: ${result.txHash.slice(0, 10)}...)` : ''}`
      );

      this.state.status = 'idle';
      this.updateMetrics(Date.now() - start, result.success);
      return result;
    } catch (err) {
      this.state.status = 'error';
      this.state.lastError = (err as Error).message;
      this.updateMetrics(Date.now() - start, false);

      const failResult: ExecutionResult = {
        success: false,
        orderId: order.id,
        error: (err as Error).message,
      };

      order.status = 'FAILED';
      await eventBus.emit({
        type: 'order.failed',
        payload: { order, result: failResult },
        timestamp: Date.now(),
        source: this.config.id,
      });

      return failResult;
    }
  }

  /**
   * Simulate order execution (dry run mode)
   * ⚠️ MOCK DATA: Uses Math.random() for simulated slippage and gas.
   * This is intentional for dry-run simulation only, NOT real market data.
   */
  private async simulateExecution(order: TradeOrder): Promise<ExecutionResult> {
    // ⚠️ MOCK: Simulate a small random delay
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    // ⚠️ MOCK: Simulate slippage with random factor
    const slippage = (Math.random() * order.slippage) / 100;
    const basePrice = order.price || this.getSimulatedPrice(order.symbol);
    const executedPrice = order.side === 'BUY'
      ? basePrice * (1 + slippage)
      : basePrice * (1 - slippage);

    // ⚠️ MOCK: Simulate gas cost with random variation
    const gasUsed = 150000 + Math.floor(Math.random() * 50000);

    return {
      success: true,
      orderId: order.id,
      txHash: `dry-run-${randomUUID()}`,
      executedPrice,
      executedQuantity: order.quantity,
      gasUsed,
    };
  }

  /**
   * Execute order on-chain via PancakeSwap (live mode)
   *
   * Routes:
   *   BUY  → swapExactETHForTokens (spend BNB, receive token)
   *   SELL → swapExactTokensForETH (spend token, receive BNB)
   */
  private async liveExecution(order: TradeOrder): Promise<ExecutionResult> {
    if (!this.chainClient) {
      return {
        success: false,
        orderId: order.id,
        error: 'No chain client configured',
      };
    }

    if (!this.chainClient.hasWallet()) {
      return {
        success: false,
        orderId: order.id,
        error: 'Wallet not configured (BNB_PRIVATE_KEY missing)',
      };
    }

    try {
      // Check gas price
      const gasPrice = await this.chainClient.getGasPrice();
      console.log(`[${this.config.name}] Gas price: ${gasPrice} wei`);

      // Resolve token addresses
      const tokenAddr = this.getTokenAddress(order.symbol);
      if (!tokenAddr) {
        return {
          success: false,
          orderId: order.id,
          error: `Unknown token: ${order.symbol}`,
        };
      }

      let swapResult;

      if (order.side === 'BUY') {
        // BUY: spend BNB, receive token
        // order.quantity is the amount of BNB to spend (in ether units)
        const bnbAmount = order.quantity.toFixed(6);

        console.log(
          `[${this.config.name}] LIVE SWAP: ${bnbAmount} BNB → ${order.symbol} ` +
          `(slippage: ${order.slippage}%)`
        );

        swapResult = await this.chainClient.swapExactETHForTokens(
          tokenAddr,
          bnbAmount,
          order.slippage,
        );
      } else {
        // SELL: spend token, receive BNB
        // order.quantity is the amount of token to sell
        // Get token decimals for proper formatting
        let decimals = 18;
        try {
          decimals = await this.chainClient.getTokenDecimals(tokenAddr);
        } catch {
          // default to 18
        }

        const tokenAmount = order.quantity.toFixed(Math.min(decimals, 6));

        console.log(
          `[${this.config.name}] LIVE SWAP: ${tokenAmount} ${order.symbol} → BNB ` +
          `(slippage: ${order.slippage}%)`
        );

        swapResult = await this.chainClient.swapExactTokensForETH(
          tokenAddr,
          tokenAmount,
          decimals,
          order.slippage,
        );
      }

      if (!swapResult.success) {
        return {
          success: false,
          orderId: order.id,
          error: swapResult.error || 'Swap failed',
        };
      }

      // Calculate executed price from amounts
      const executedPrice = swapResult.amountOut && swapResult.amountIn
        ? Number(swapResult.amountOut) / Number(swapResult.amountIn)
        : order.price || 0;

      return {
        success: true,
        orderId: order.id,
        txHash: swapResult.txHash,
        executedPrice,
        executedQuantity: order.quantity,
        gasUsed: swapResult.gasUsed ? Number(swapResult.gasUsed) : undefined,
      };
    } catch (err) {
      return {
        success: false,
        orderId: order.id,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Update portfolio state after execution
   */
  private updatePortfolio(order: TradeOrder): void {
    const { symbol, side, executedPrice, executedQuantity } = order;
    if (!executedPrice || !executedQuantity) return;

    if (side === 'BUY') {
      // BUY: find existing BUY position to average in, or create new one
      const existingPos = this.portfolio.positions.find((p) => p.symbol === symbol && p.side === 'BUY');

      if (existingPos) {
        const totalCost = existingPos.entryPrice * existingPos.quantity + executedPrice * executedQuantity;
        existingPos.quantity += executedQuantity;
        existingPos.entryPrice = totalCost / existingPos.quantity;
      } else {
        this.portfolio.positions.push({
          symbol,
          side: 'BUY',
          quantity: executedQuantity,
          entryPrice: executedPrice,
          currentPrice: executedPrice,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          strategyId: order.strategyId,
        });
      }

      this.portfolio.availableBalance -= executedPrice * executedQuantity;
    } else {
      // SELL: find existing BUY position and reduce its quantity
      const existingBuyPos = this.portfolio.positions.find((p) => p.symbol === symbol && p.side === 'BUY');

      if (existingBuyPos) {
        existingBuyPos.quantity -= executedQuantity;
        // Remove position if fully sold
        if (existingBuyPos.quantity <= 0) {
          const overshoot = Math.abs(existingBuyPos.quantity);
          this.portfolio.positions = this.portfolio.positions.filter((p) => p !== existingBuyPos);
          // If oversold, create a SHORT position for the excess
          if (overshoot > 0) {
            this.portfolio.positions.push({
              symbol,
              side: 'SHORT',
              quantity: overshoot,
              entryPrice: executedPrice,
              currentPrice: executedPrice,
              unrealizedPnl: 0,
              unrealizedPnlPct: 0,
              strategyId: order.strategyId,
            });
          }
        }
      } else {
        // No existing BUY position — create a SHORT position
        this.portfolio.positions.push({
          symbol,
          side: 'SHORT',
          quantity: executedQuantity,
          entryPrice: executedPrice,
          currentPrice: executedPrice,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          strategyId: order.strategyId,
        });
      }

      this.portfolio.availableBalance += executedPrice * executedQuantity;
    }

    this.portfolio.timestamp = Date.now();
  }

  private getSimulatedPrice(symbol: string): number {
    // Simulated prices for common tokens
    const prices: Record<string, number> = {
      BTC: 65000,
      ETH: 3500,
      BNB: 600,
      CAKE: 2.5,
      USDT: 1,
      USDC: 1,
      BUSD: 1,
    };
    return prices[symbol] || 100;
  }

  private getTokenAddress(symbol: string): string | null {
    return BSC_TOKENS[symbol] || null;
  }

  getPortfolio(): PortfolioState {
    return { ...this.portfolio };
  }

  getExecutionHistory(limit: number = 50): ExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  getOrderQueue(): TradeOrder[] {
    return [...this.orderQueue];
  }

  setDryRun(enabled: boolean): void {
    this.isDryRun = enabled;
    console.log(`[${this.config.name}] Dry run ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  getState(): AgentState {
    return { ...this.state };
  }

  /** Get the underlying chain client for balance queries etc. */
  getChainClient(): BNBChainClient | null {
    return this.chainClient;
  }

  private updateMetrics(processingTime: number, success: boolean): void {
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) this.processingTimes.shift();

    const metrics = this.state.metrics;
    metrics.totalRuns++;
    metrics.lastProcessingTime = processingTime;
    metrics.avgProcessingTime =
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    metrics.successRate = success
      ? (metrics.successRate * (metrics.totalRuns - 1) + 1) / metrics.totalRuns
      : (metrics.successRate * (metrics.totalRuns - 1)) / metrics.totalRuns;

    this.state.lastRun = Date.now();
  }
}
