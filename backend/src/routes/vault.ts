import { FastifyInstance } from "fastify";

export async function vaultRoutes(server: FastifyInstance) {
  server.get("/info", async () => {
    return {
      name: "YieldMind Vault",
      totalDeposits: "0",
      apy: "0%",
      strategies: [],
    };
  });

  server.get("/balance/:address", async (request) => {
    const { address } = request.params as { address: string };
    return {
      address,
      balance: "0",
      yieldEarned: "0",
    };
  });
}
