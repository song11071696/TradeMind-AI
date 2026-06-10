const dotenv = require('dotenv');
dotenv.config();
const { createPublicClient, http, formatUnits } = require('viem');
const { bsc } = require('viem/chains');

async function test() {
  const client = createPublicClient({
    chain: bsc,
    transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org'),
  });

  console.log('=== YieldMind BSC Connectivity Test ===\n');

  // 1. Check BSC connection
  const blockNumber = await client.getBlockNumber();
  console.log('[OK] BSC Connected. Block:', blockNumber.toString());

  // 2. Check gas price
  const gasPrice = await client.getGasPrice();
  console.log('[OK] Gas Price:', formatUnits(gasPrice, 9), 'gwei');

  // 3. Check wallet balance
  const walletAddr = '0x7FA44ffc5b7652d8E45B421e7361F51f6f08b93D';
  const balance = await client.getBalance({ address: walletAddr });
  const bnbBalance = formatUnits(balance, 18);
  console.log('[OK] Wallet Balance:', bnbBalance, 'BNB');

  // 4. Check if private key is configured
  const pk = process.env.BNB_PRIVATE_KEY;
  if (pk) {
    console.log('[OK] Private Key: CONFIGURED (' + pk.length + ' chars)');
  } else {
    console.log('[WARN] Private Key: NOT SET (read-only mode)');
  }

  // 5. Try PancakeSwap router read
  const ROUTER_ABI = [{
    name: 'WETH',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  }];
  const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const weth = await client.readContract({
    address: PANCAKE_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'WETH',
  });
  console.log('[OK] PancakeSwap Router WETH:', weth);

  // Summary
  console.log('\n=== Summary ===');
  console.log('BSC Mainnet: CONNECTED');
  console.log('PancakeSwap: ACCESSIBLE');
  console.log('Wallet:', walletAddr);
  console.log('Balance:', bnbBalance, 'BNB');
  if (parseFloat(bnbBalance) > 0.001) {
    console.log('Ready for live trading: YES (sufficient balance)');
  } else {
    console.log('Ready for live trading: NO (insufficient BNB for gas)');
  }
}

test().catch(e => console.error('[FAIL] Error:', e.message));
