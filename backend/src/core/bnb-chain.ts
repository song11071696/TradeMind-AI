// ============================================================
// TradeMind AI - BNB Chain Integration Layer
// ============================================================
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  formatEther,
  parseUnits,
  parseEther,
  type Address,
  type Hash,
  type WalletClient,
  type PublicClient,
  type Account,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { BNBChainConfig } from '../types';

// Common BSC token addresses
export const BSC_TOKENS: Record<string, string> = {
  BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
  ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
};

const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

// Full Router ABI for swap operations
const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactETHForTokens',
    type: 'function' as const,
    stateMutability: 'payable' as const,
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForETH',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'WETH',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'approve',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface SwapResult {
  success: boolean;
  txHash?: string;
  amountIn?: bigint;
  amountOut?: bigint;
  gasUsed?: bigint;
  error?: string;
}

export class BNBChainClient {
  private config: BNBChainConfig;
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  private account: Account | null = null;

  constructor(config: BNBChainConfig) {
    this.config = config;
    const chain = config.chainId === 97 ? bscTestnet : bsc;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    }) as PublicClient;

    // Create wallet client if private key is provided
    if (config.privateKey) {
      try {
        // Normalize private key (add 0x prefix if missing)
        let pk = config.privateKey;
        if (!pk.startsWith('0x')) {
          pk = `0x${pk}`;
        }
        this.account = privateKeyToAccount(pk as `0x${string}`);
        this.walletClient = createWalletClient({
          account: this.account,
          chain,
          transport: http(config.rpcUrl),
        });
        console.log(`[BNBChainClient] Wallet loaded: ${this.account.address}`);
      } catch (err) {
        console.error('[BNBChainClient] Failed to load wallet:', (err as Error).message);
      }
    } else {
      console.log('[BNBChainClient] No private key provided — read-only mode');
    }
  }

  /** Check if wallet is configured (can write transactions) */
  hasWallet(): boolean {
    return this.walletClient !== null && this.account !== null;
  }

  /** Get the wallet address */
  getWalletAddress(): Address | null {
    return this.account?.address ?? null;
  }

  async getBalance(address: string): Promise<bigint> {
    return this.publicClient.getBalance({ address: address as Address });
  }

  /** Get formatted BNB balance as a number */
  async getFormattedBalance(address?: string): Promise<number> {
    const addr = address ?? this.account?.address;
    if (!addr) throw new Error('No address provided and no wallet configured');
    const balance = await this.getBalance(addr);
    return Number(formatUnits(balance, 18));
  }

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    return (this.publicClient as any).readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    });
  }

  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const decimals = await (this.publicClient as any).readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'decimals',
      args: [],
    });
    return Number(decimals);
  }

  async getAmountsOut(amountIn: bigint, path: string[]): Promise<bigint[]> {
    const result = await (this.publicClient as any).readContract({
      address: PANCAKE_ROUTER as Address,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path as Address[]],
    });
    return result as unknown as bigint[];
  }

  async getPrice(tokenIn: string, tokenOut: string): Promise<number> {
    const amounts = await this.getAmountsOut(
      BigInt('1000000000000000000'),
      [tokenIn, tokenOut]
    );
    return Number(formatUnits(amounts[1], 18));
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  // ============================================================
  // Convenience: Swap BNB → Token
  // ============================================================

  /**
   * Convenience wrapper: swap BNB for a token via PancakeSwap Router.
   * @param tokenAddress - destination token address
   * @param amountBNB - amount of BNB in ether units (e.g. "0.01")
   * @param slippagePct - slippage tolerance % (default 1)
   */
  async swapBNBForToken(
    tokenAddress: string,
    amountBNB: string,
    slippagePct: number = 1,
  ): Promise<SwapResult> {
    return this.swapExactETHForTokens(tokenAddress, amountBNB, slippagePct);
  }

  async getGasPrice(): Promise<bigint> {
    return this.publicClient.getGasPrice();
  }

  // ============================================================
  // Token Approval
  // ============================================================

  /** Check allowance for a token against the PancakeSwap router */
  async getAllowance(tokenAddress: string, owner: string): Promise<bigint> {
    return (this.publicClient as any).readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner as Address, PANCAKE_ROUTER as Address],
    }) as Promise<bigint>;
  }

  /** Approve a token for spending by PancakeSwap router */
  async approveToken(tokenAddress: string, amount: bigint): Promise<Hash> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet not configured — cannot approve tokens');
    }

    const hash = await this.walletClient.writeContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PANCAKE_ROUTER as Address, amount],
      account: this.account,
      chain: this.walletClient.chain!,
    });

    console.log(`[BNBChainClient] Approve tx sent: ${hash}`);

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    console.log(`[BNBChainClient] Approve confirmed in block ${receipt.blockNumber}`);
    return hash;
  }

  // ============================================================
  // Swap: BNB → Token (swapExactETHForTokens)
  // ============================================================

  /**
   * Swap BNB for tokens via PancakeSwap.
   * @param tokenOut  - destination token address (e.g. USDT)
   * @param amountInBNB - amount of BNB to spend (in ether units, e.g. "0.001")
   * @param slippagePct - slippage tolerance in % (default 1%)
   */
  async swapExactETHForTokens(
    tokenOut: string,
    amountInBNB: string,
    slippagePct: number = 1,
  ): Promise<SwapResult> {
    if (!this.walletClient || !this.account) {
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const amountIn = parseEther(amountInBNB);
      const path = [BSC_TOKENS.WBNB as Address, tokenOut as Address];

      // Get expected output
      const amounts = await this.getAmountsOut(amountIn, path);
      const expectedOut = amounts[amounts.length - 1];

      // Apply slippage
      const amountOutMin = expectedOut - (expectedOut * BigInt(Math.floor(slippagePct * 100))) / BigInt(10000);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

      console.log(
        `[BNBChainClient] Swapping ${amountInBNB} BNB → ${tokenOut} ` +
        `(expected: ${expectedOut}, minOut: ${amountOutMin})`
      );

      const hash = await this.walletClient.writeContract({
        address: PANCAKE_ROUTER as Address,
        abi: ROUTER_ABI,
        functionName: 'swapExactETHForTokens',
        args: [amountOutMin, path, this.account.address, deadline],
        value: amountIn,
        account: this.account,
        chain: this.walletClient.chain!,
      });

      console.log(`[BNBChainClient] Swap tx sent: ${hash}`);

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });

      console.log(
        `[BNBChainClient] Swap confirmed: block=${receipt.blockNumber}, ` +
        `gasUsed=${receipt.gasUsed}, status=${receipt.status}`
      );

      return {
        success: receipt.status === 'success',
        txHash: hash,
        amountIn,
        amountOut: expectedOut,
        gasUsed: receipt.gasUsed,
      };
    } catch (err) {
      console.error('[BNBChainClient] swapExactETHForTokens failed:', (err as Error).message);
      return { success: false, error: (err as Error).message };
    }
  }

  // ============================================================
  // Swap: Token → BNB (swapExactTokensForETH)
  // ============================================================

  /**
   * Swap tokens for BNB via PancakeSwap.
   * @param tokenIn  - source token address (e.g. USDT)
   * @param amountInHuman - amount in human-readable units (e.g. "10" for 10 USDT)
   * @param decimals - token decimals (e.g. 18 for USDT on BSC)
   * @param slippagePct - slippage tolerance in % (default 1%)
   */
  async swapExactTokensForETH(
    tokenIn: string,
    amountInHuman: string,
    decimals: number = 18,
    slippagePct: number = 1,
  ): Promise<SwapResult> {
    if (!this.walletClient || !this.account) {
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const amountIn = parseUnits(amountInHuman, decimals);
      const path = [tokenIn as Address, BSC_TOKENS.WBNB as Address];

      // Get expected output
      const amounts = await this.getAmountsOut(amountIn, path);
      const expectedOut = amounts[amounts.length - 1];

      // Apply slippage
      const amountOutMin = expectedOut - (expectedOut * BigInt(Math.floor(slippagePct * 100))) / BigInt(10000);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      // Check and approve if needed
      const currentAllowance = await this.getAllowance(tokenIn, this.account.address);
      if (currentAllowance < amountIn) {
        console.log('[BNBChainClient] Insufficient allowance, approving...');
        // Only approve the exact amount needed to limit exposure if router is compromised
        await this.approveToken(tokenIn, amountIn);
      }

      console.log(
        `[BNBChainClient] Swapping ${amountInHuman} ${tokenIn} → BNB ` +
        `(expected: ${expectedOut}, minOut: ${amountOutMin})`
      );

      const hash = await this.walletClient.writeContract({
        address: PANCAKE_ROUTER as Address,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForETH',
        args: [amountIn, amountOutMin, path, this.account.address, deadline],
        account: this.account,
        chain: this.walletClient.chain!,
      });

      console.log(`[BNBChainClient] Swap tx sent: ${hash}`);

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });

      console.log(
        `[BNBChainClient] Swap confirmed: block=${receipt.blockNumber}, ` +
        `gasUsed=${receipt.gasUsed}, status=${receipt.status}`
      );

      return {
        success: receipt.status === 'success',
        txHash: hash,
        amountIn,
        amountOut: expectedOut,
        gasUsed: receipt.gasUsed,
      };
    } catch (err) {
      console.error('[BNBChainClient] swapExactTokensForETH failed:', (err as Error).message);
      return { success: false, error: (err as Error).message };
    }
  }

  // ============================================================
  // Swap: Token → Token (swapExactTokensForTokens)
  // ============================================================

  async swapExactTokensForTokens(
    tokenIn: string,
    tokenOut: string,
    amountInHuman: string,
    decimalsIn: number = 18,
    slippagePct: number = 1,
  ): Promise<SwapResult> {
    if (!this.walletClient || !this.account) {
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const amountIn = parseUnits(amountInHuman, decimalsIn);
      const path = [tokenIn as Address, tokenOut as Address];

      const amounts = await this.getAmountsOut(amountIn, path);
      const expectedOut = amounts[amounts.length - 1];
      const amountOutMin = expectedOut - (expectedOut * BigInt(Math.floor(slippagePct * 100))) / BigInt(10000);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      // Check and approve if needed
      const currentAllowance = await this.getAllowance(tokenIn, this.account.address);
      if (currentAllowance < amountIn) {
        console.log('[BNBChainClient] Insufficient allowance, approving...');
        await this.approveToken(tokenIn, amountIn);
      }

      const hash = await this.walletClient.writeContract({
        address: PANCAKE_ROUTER as Address,
        abi: ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountIn, amountOutMin, path, this.account.address, deadline],
        account: this.account,
        chain: this.walletClient.chain!,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });

      return {
        success: receipt.status === 'success',
        txHash: hash,
        amountIn,
        amountOut: expectedOut,
        gasUsed: receipt.gasUsed,
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // ============================================================
  // Wait for tx confirmation helper
  // ============================================================

  async waitForTransaction(hash: Hash, timeout: number = 120_000) {
    return this.publicClient.waitForTransactionReceipt({ hash, timeout });
  }

  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  getWalletClient(): WalletClient | null {
    return this.walletClient;
  }
}
