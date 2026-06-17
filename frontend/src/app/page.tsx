import VaultInterface from '../components/VaultInterface'

export default function Home() {
  return (
    <main
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
      }}
    >
      <section style={{ marginBottom: '2rem' }}>
        <h1>YieldMind</h1>
        <p>Autonomous DeFi yield optimization on BNB Chain testnet.</p>
        <p style={{ marginTop: '0.75rem', color: '#9ca3af' }}>
          Connect a wallet on BSC Testnet to inspect the live vault contract and
          test deposit or withdrawal flows.
        </p>
      </section>

      <VaultInterface />
    </main>
  )
}
