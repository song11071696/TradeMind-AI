'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useState } from 'react'
import { YieldMindCoreABI, CONTRACTS } from '../config/contracts'

export default function VaultInterface() {
  const { address, isConnected } = useAccount()
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')

  // Read vault data
  const { data: totalDeposits } = useContractRead({
    address: CONTRACTS.yieldMindCore as `0x${string}`,
    abi: YieldMindCoreABI,
    functionName: 'totalDeposits',
  })

  const { data: vaultAPY } = useContractRead({
    address: CONTRACTS.yieldMindCore as `0x${string}`,
    abi: YieldMindCoreABI,
    functionName: 'getVaultAPY',
  })

  const { data: userBalance } = useContractRead({
    address: CONTRACTS.yieldMindCore as `0x${string}`,
    abi: YieldMindCoreABI,
    functionName: 'getUserBalance',
    args: [address!],
    enabled: !!address,
  })

  // Prepare deposit
  const { config: depositConfig } = usePrepareContractWrite({
    address: CONTRACTS.yieldMindCore as `0x${string}`,
    abi: YieldMindCoreABI,
    functionName: 'deposit',
    args: [parseEther(depositAmount || '0')],
    enabled: !!depositAmount && parseFloat(depositAmount) > 0,
  })

  const { write: deposit } = useContractWrite(depositConfig)

  // Prepare withdraw
  const { config: withdrawConfig } = usePrepareContractWrite({
    address: CONTRACTS.yieldMindCore as `0x${string}`,
    abi: YieldMindCoreABI,
    functionName: 'withdraw',
    args: [parseEther(withdrawAmount || '0')],
    enabled: !!withdrawAmount && parseFloat(withdrawAmount) > 0,
  })

  const { write: withdraw } = useContractWrite(withdrawConfig)

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">YieldMind Vault</h1>
        <ConnectButton />
      </div>

      {isConnected && (
        <div className="space-y-6">
          {/* Vault Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Total Deposits</p>
              <p className="text-2xl font-bold text-white">
                {totalDeposits ? formatEther(totalDeposits) : '0'} USDT
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Current APY</p>
              <p className="text-2xl font-bold text-green-400">
                {vaultAPY ? (Number(vaultAPY) / 100).toFixed(2) : '0'}%
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Your Shares</p>
              <p className="text-2xl font-bold text-white">
                {userBalance ? formatEther(userBalance[1]) : '0'}
              </p>
            </div>
          </div>

          {/* Deposit Section */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Deposit</h2>
            <div className="flex gap-4">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount to deposit"
                className="flex-1 px-4 py-2 bg-gray-700 rounded-lg text-white"
              />
              <button
                onClick={() => deposit?.()}
                disabled={!deposit}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Deposit
              </button>
            </div>
          </div>

          {/* Withdraw Section */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Withdraw</h2>
            <div className="flex gap-4">
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Shares to withdraw"
                className="flex-1 px-4 py-2 bg-gray-700 rounded-lg text-white"
              />
              <button
                onClick={() => withdraw?.()}
                disabled={!withdraw}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">Connect your wallet to start earning yield</p>
        </div>
      )}
    </div>
  )
}
