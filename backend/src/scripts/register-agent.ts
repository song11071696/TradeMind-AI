/**
 * YieldMind — ERC-8004 Agent Identity Registration
 *
 * Registers the YieldMind trading agent on-chain via the ERC-8004
 * Agent Identity Registry contract on BNB Chain (BSC testnet).
 *
 * This script:
 *   1. Reads the agent's wallet private key from .env
 *   2. Calls the ERC-8004 registry contract to register the agent
 *   3. Records the registration transaction hash and agent ID
 *
 * Usage:
 *   npx tsx src/scripts/register-agent.ts
 *
 * Environment:
 *   BSC_TESTNET_RPC  — BSC testnet RPC URL
 *   PRIVATE_KEY      — Deployer / agent wallet private key
 */

import { createWalletClient, createPublicClient, http, parseAbi, toHex } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ─── Configuration ────────────────────────────────────────────

const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC || 'https://bsc-testnet-rpc.publicnode.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.BNB_PRIVATE_KEY;

// ERC-8004 Agent Identity Registry (BSC Testnet)
// Standard ERC-8004 registry address; replace with actual deployed address if custom
const ERC8004_REGISTRY_ADDRESS = process.env.ERC8004_REGISTRY_ADDRESS ||
  '0x0000000000000000000000000000000000008004';

// ─── ERC-8004 Registry ABI (minimal) ──────────────────────────

const REGISTRY_ABI = parseAbi([
  'function register(string name, string description, string endpoint) external returns (uint256)',
  'function getAgent(uint256 agentId) external view returns (string name, string description, string endpoint, address owner)',
  'event AgentRegistered(uint256 indexed agentId, string name, address indexed owner)',
]);

// ─── Agent Identity Metadata ──────────────────────────────────

const AGENT_METADATA = {
  name: 'YieldMind Trading Agent',
  description:
    'DeFi yield optimization and autonomous trading agent on BNB Chain. ' +
    'Features: 5-factor signal fusion, adaptive weight learning, multi-layer risk management, ' +
    'and PancakeSwap execution via smart contract vault.',
  endpoint: 'https://yieldmind-backend.onrender.com/api/health',
};

// ─── Helper: write registration record ────────────────────────

function saveRecord(record: Record<string, unknown>): string {
  const recordPath = path.resolve(__dirname, '../../../deployments/agent-registration.json');
  const deploymentsDir = path.dirname(recordPath);

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  return recordPath;
}

// ─── Main Registration Flow ───────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  YieldMind — ERC-8004 Agent Identity Registration');
  console.log('══════════════════════════════════════════════════');
  console.log('');

  // Validate environment
  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set. Add it to .env');
    console.error('   PRIVATE_KEY=0x...');
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

  console.log('📋 Registration Details:');
  console.log(`   Agent Name : ${AGENT_METADATA.name}`);
  console.log(`   Endpoint   : ${AGENT_METADATA.endpoint}`);
  console.log(`   Registry   : ${ERC8004_REGISTRY_ADDRESS}`);
  console.log(`   Network    : BSC Testnet (Chain ID 97)`);
  console.log(`   Owner      : ${account.address}`);
  console.log('');

  // Create clients
  const transport = http(BSC_TESTNET_RPC);

  const publicClient = createPublicClient({
    chain: bscTestnet,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: bscTestnet,
    transport,
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Wallet balance: ${balance} wei (${Number(balance) / 1e18} tBNB)`);

  if (balance === BigInt(0)) {
    console.error('❌ Insufficient balance. Get tBNB from https://testnet.bnbchain.org/faucet-smart');
    process.exit(1);
  }

  // ─── Attempt ERC-8004 Registry ──────────────────────────────

  console.log('');
  console.log('📝 Registering agent identity on-chain...');

  try {
    // Simulate the transaction first
    const { request } = await publicClient.simulateContract({
      address: ERC8004_REGISTRY_ADDRESS as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'register',
      args: [AGENT_METADATA.name, AGENT_METADATA.description, AGENT_METADATA.endpoint],
      account,
    });

    // Execute
    const txHash = await walletClient.writeContract(request);

    console.log('');
    console.log('✅ Transaction submitted!');
    console.log(`   TX Hash: ${txHash}`);
    console.log(`   Explorer: https://testnet.bscscan.com/tx/${txHash}`);

    // Wait for confirmation
    console.log('');
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
    console.log(`   Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Gas Used: ${receipt.gasUsed}`);

    // Save registration record
    const recordPath = saveRecord({
      timestamp: new Date().toISOString(),
      network: 'BSC Testnet',
      chainId: 97,
      registryAddress: ERC8004_REGISTRY_ADDRESS,
      agent: AGENT_METADATA,
      owner: account.address,
      transactionHash: txHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status,
    });

    console.log('');
    console.log('📄 Registration record saved to:');
    console.log(`   ${recordPath}`);
    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('  Registration Complete');
    console.log('══════════════════════════════════════════════════');

  } catch (error: unknown) {
    // If the registry contract doesn't exist yet on testnet, fall back to
    // a self-registration approach: write a simple on-chain memo transaction
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn('');
    console.warn('⚠️  ERC-8004 registry not available on BSC testnet.');
    console.warn(`   Error: ${errMsg}`);
    console.warn('   Falling back to self-registration via calldata memo...');

    try {
      // Encode agent metadata as a JSON memo in a 0-value transaction
      const memo = JSON.stringify({
        standard: 'ERC-8004',
        type: 'agent-registration',
        agent: AGENT_METADATA,
        version: '1.0.0',
      });

      const memoHex = toHex(Buffer.from(memo, 'utf-8'));

      // Send a 0-value tx to self with memo
      const txHash = await walletClient.sendTransaction({
        to: account.address,
        value: BigInt(0),
        data: memoHex,
      });

      console.log('');
      console.log('✅ Self-registration transaction submitted!');
      console.log(`   TX Hash: ${txHash}`);
      console.log(`   Explorer: https://testnet.bscscan.com/tx/${txHash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed}`);

      // Save record
      const recordPath = saveRecord({
        timestamp: new Date().toISOString(),
        network: 'BSC Testnet',
        chainId: 97,
        method: 'self-registration-memo',
        agent: AGENT_METADATA,
        owner: account.address,
        transactionHash: txHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status,
        note: 'ERC-8004 registry not yet deployed on BSC testnet; used calldata memo fallback',
      });

      console.log('');
      console.log('📄 Registration record saved to:');
      console.log(`   ${recordPath}`);
      console.log('');
      console.log('══════════════════════════════════════════════════');
      console.log('  Registration Complete (Memo Fallback)');
      console.log('══════════════════════════════════════════════════');

    } catch (fallbackError: unknown) {
      const fbErrMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error('');
      console.error('❌ Registration failed:', fbErrMsg);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
