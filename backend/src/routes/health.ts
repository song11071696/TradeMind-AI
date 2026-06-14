import { FastifyInstance } from "fastify";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health", async () => {
    return {
      status: "ok",
      service: "yieldmind-api",
      timestamp: new Date().toISOString(),
    };
  });
}
