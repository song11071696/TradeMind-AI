// YieldMind ABI (core functions)
export const YieldMindCoreABI = [
  // View functions
  {
    inputs: [],
    name: 'totalDeposits',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getVaultAPY',
    outputs: [{ internalType: 'uint256', name: 'weightedAPY', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getActiveStrategies',
    outputs: [{ internalType: 'address[]', name: 'activeStrategies', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserBalance',
    outputs: [
      { internalType: 'uint256', name: 'depositAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'sharesAmount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // State-changing functions
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'withdraw',
    outputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'shares', type: 'uint256' },
    ],
    name: 'Deposit',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'shares', type: 'uint256' },
    ],
    name: 'Withdraw',
    type: 'event',
  },
] as const

// Contract addresses (deployed to BSC Testnet 2026-06-05)
export const CONTRACTS = {
  yieldMindCore: process.env.NEXT_PUBLIC_YIELDMIND_CORE || '0x7a7a523Cef7132ffA563B52Fba975D49E620C0a8',
  yieldMindVault: process.env.NEXT_PUBLIC_YIELDMIND_VAULT || '0x81cDC275bE14AB997a508D8ADB613Ff8a0B92a7d',
  mockToken: process.env.NEXT_PUBLIC_MOCK_TOKEN || '0x1a50060f1C8E2bC4964afAAc08e4aB439E72D6A9',
  strategyPancakeSwap: '0x16cCf218574dE3cbe55e76E066A70bAb60853a90',
  strategyVenus: '0xCcf7D61c591036008b6f8E93375A190C418Ed63e',
} as const
