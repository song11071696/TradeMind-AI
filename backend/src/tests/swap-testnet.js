const { createPublicClient, http, formatEther, parseEther, createWalletClient, encodeFunctionData } = require('viem');
const { bscTestnet } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const WALLET = '0x7FA44ffc5b7652d8E45B421e7361F51f6f08b93D';
const PRIVATE_KEY = process.env.BNB_PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error('[ERROR] BNB_PRIVATE_KEY env var is required'); process.exit(1); }
const BSC_TESTNET_RPC = 'https://bsc-testnet-rpc.publicnode.com';

// PancakeSwap Router on BSC Testnet
const PANCAKE_ROUTER = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1';
const WBNB = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';
const USDT = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';

async function main() {
  const client = createPublicClient({ chain: bscTestnet, transport: http(BSC_TESTNET_RPC) });
  
  // Check balance
  const balance = await client.getBalance({ address: WALLET });
  console.log(`[Wallet] ${WALLET}`);
  console.log(`[Balance] ${formatEther(balance)} tBNB`);
  
  if (balance < parseEther('0.01')) {
    console.log('\n[WARN] Insufficient tBNB for swap. Need at least 0.01 tBNB.');
    console.log('[INFO] Get testnet BNB from: https://testnet.bnbchain.org/faucet-smart');
    console.log('[INFO] Wallet address to fund:', WALLET);
    return;
  }
  
  // Attempt a small swap: 0.001 BNB -> USDT via PancakeSwap
  const account = privateKeyToAccount('0x' + PRIVATE_KEY);
  const walletClient = createWalletClient({ 
    account, 
    chain: bscTestnet, 
    transport: http(BSC_TESTNET_RPC) 
  });
  
  const swapAmount = parseEther('0.001');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 minutes
  
  console.log(`\n[Swap] Swapping 0.001 tBNB -> USDT via PancakeSwap Router`);
  console.log(`[Router] ${PANCAKE_ROUTER}`);
  
  try {
    // swapExactETHForTokens: amountOutMin, path, to, deadline
    const data = encodeFunctionData({
      abi: [{
        name: 'swapExactETHForTokens',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
          { name: 'amountOutMin', type: 'uint256' },
          { name: 'path', type: 'address[]' },
          { name: 'to', type: 'address' },
          { name: 'deadline', type: 'uint256' }
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }]
      }],
      functionName: 'swapExactETHForTokens',
      args: [
        BigInt(0), // amountOutMin = 0 (accept any amount for testnet)
        [WBNB, USDT],
        WALLET,
        deadline
      ]
    });
    
    const tx = await walletClient.sendTransaction({
      to: PANCAKE_ROUTER,
      data,
      value: swapAmount,
      gas: BigInt(300000),
    });
    
    console.log(`[SUCCESS] Transaction hash: ${tx}`);
    console.log(`[Explorer] https://testnet.bscscan.com/tx/${tx}`);
    
    // Wait for receipt
    console.log('[Waiting] Confirming transaction...');
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    console.log(`[Confirmed] Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
  } catch (err) {
    console.error('[ERROR] Swap failed:', err.message?.slice(0, 200));
  }
}

main().catch(console.error);
