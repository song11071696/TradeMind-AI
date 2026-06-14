const { createPublicClient, http } = require('viem');
const { bsc } = require('viem/chains');

async function test(rpcUrl) {
  const client = createPublicClient({ chain: bsc, transport: http(rpcUrl, { timeout: 15000 }) });
  const block = await client.getBlockNumber();
  console.log('RPC OK:', rpcUrl, 'block:', block.toString());
  return client;
}

(async () => {
  const rpcs = [
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed.bnbchain.org',
    'https://rpc.ankr.com/bsc',
  ];
  for (const rpc of rpcs) {
    try {
      await test(rpc);
      break;
    } catch(e) {
      console.log('FAILED:', rpc, '-', e.message.slice(0, 80));
    }
  }
})();
