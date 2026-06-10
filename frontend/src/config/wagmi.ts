import { createConfig, configureChains, mainnet } from 'wagmi'
import { publicProvider } from 'wagmi/providers/public'
import { bscTestnet, bsc } from 'wagmi/chains'
import { getDefaultWallets } from '@rainbow-me/rainbowkit'

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [bscTestnet, bsc, mainnet],
  [publicProvider()]
)

const { connectors } = getDefaultWallets({
  appName: 'YieldMind',
  projectId: 'YOUR_PROJECT_ID',
  chains,
})

export const config = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
})

export { chains }
