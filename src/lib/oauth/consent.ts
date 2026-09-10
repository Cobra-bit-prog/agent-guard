import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getOauthStore } from "./sql-store.ts";

export type ConsentAgent = {
  id: string;
  name: string;
  chain: string;
  address: string;
  is_demo: boolean;
};

export const listConsentAgents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ userId: string; agents: ConsentAgent[] }> => {
    const store = await getOauthStore();
    const agents = await store.listAgentsForUser(context.userId);
    return {
      userId: context.userId,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        chain: agent.chain,
        address: agent.address,
        is_demo: agent.is_demo,
      })),
    };
  });
