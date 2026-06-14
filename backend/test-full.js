const dotenv = require('dotenv');
dotenv.config();
const { createPublicClient, createWalletClient, http, formatUnits } = require('viem');
const { bsc } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const RPC_URL = 'https://bsc-dataseed.bnbchain.org';
const WALLET = '0x7FA44ffc5b7652d8E45B421e7361F51f6f08b93D';

async function test() {
  console.log('=== YieldMind BSC Full Test ===\n');

  const client = createPublicClient({
    chain: bsc,
    transport: http(RPC_URL, { timeout: 15000 }),
  });

  // 1. BSC connection
  const blockNumber = await client.getBlockNumber();
  console.log('[OK] BSC Connected. Block:', blockNumber.toString());

  // 2. Gas price
  const gasPrice = await client.getGasPrice();
  console.log('[OK] Gas Price:', formatUnits(gasPrice, 9), 'gwei');

  // 3. Wallet balance
  const balance = await client.getBalance({ address: WALLET });
  const bnbBalance = formatUnits(balance, 18);
  console.log('[OK] Wallet Balance:', bnbBalance, 'BNB');

  // 4. Private key check
  const pk = process.env.BNB_PRIVATE_KEY;
  if (pk) {
    try {
      let pkHex = pk.startsWith('0x') ? pk : '0x' + pk;
      const account = privateKeyToAccount(pkHex);
      console.log('[OK] Wallet from PK:', account.address);
      console.log('[OK] Address match:', account.address.toLowerCase() === WALLET.toLowerCase());
      
      // Try creating a wallet client
      const walletClient = createWalletClient({
        account,
        chain: bsc,
        transport: http(RPC_URL, { timeout: 15000 }),
      });
      console.log('[OK] WalletClient created successfully');
    } catch(e) {
      console.log('[WARN] Private key error:', e.message);
    }
  } else {
    console.log('[WARN] BNB_PRIVATE_KEY not set');
  }

  // 5. PancakeSwap router
  const ROUTER_ABI = [
    { name: 'WETH', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
    { name: 'getAmountsOut', type: 'function', stateMutability: 'view', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
  ];
  const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const USDT = '0x55d398326f99059fF775485246999027B3197955';

  const weth = await client.readContract({ address: PANCAKE_ROUTER, abi: ROUTER_ABI, functionName: 'WETH' });
  console.log('[OK] PancakeSwap WETH:', weth);
  console.log('[OK] WETH == WBNB:', weth.toLowerCase() === WBNB.toLowerCase());

  // 6. Price quote: 1 BNB -> USDT
  const amounts = await client.readContract({
    address: PANCAKE_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [BigInt('1000000000000000000'), [WBNB, USDT]],
  });
  const usdtAmount = formatUnits(amounts[1], 18);
  console.log('[OK] 1 BNB =', parseFloat(usdtAmount).toFixed(2), 'USDT');

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('BSC Mainnet: CONNECTED (via bsc-dataseed.bnbchain.org)');
  console.log('PancakeSwap Router: ACCESSIBLE');
  console.log('Price oracle: WORKING');
  console.log('Wallet:', WALLET);
  console.log('Balance:', bnbBalance, 'BNB');
  if (pk) console.log('Private Key: CONFIGURED');
  if (parseFloat(bnbBalance) > 0.005) {
    console.log('>>> READY for live trading with real tx <<<');
  } else {
    console.log('>>> Need more BNB for gas (have', bnbBalance, ') <<<');
  }
}

test().catch(e => console.error('[FAIL]', e.message));
