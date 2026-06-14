import { FastifyInstance } from "fastify";

/** Validate BNB Chain (EVM) address format */
function isValidEVMAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export async function vaultRoutes(server: FastifyInstance) {
  server.get("/info", async () => {
    return {
      name: "YieldMind Vault",
      totalDeposits: "0",
      apy: "0%",
      strategies: [],
    };
  });

  server.get("/balance/:address", async (request, reply) => {
    const { address } = request.params as { address: string };

    if (!isValidEVMAddress(address)) {
      reply.code(400).send({
        error: "Invalid address",
        message: "Address must be a valid EVM address (0x followed by 40 hex characters)",
      });
      return;
    }

    return {
      address,
      balance: "0",
      yieldEarned: "0",
    };
  });
}
