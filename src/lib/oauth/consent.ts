import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { describeConsentTarget } from "./protocol.ts";
import { getOauthStore } from "./sql-store.ts";

export type ConsentAgent = {
  id: string;
  name: string;
  chain: string;
  address: string;
  is_demo: boolean;
};

export const describeConsentClient = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({
        clientId: z.string().max(200),
        redirectUri: z.string().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const store = await getOauthStore();
    return describeConsentTarget(store, data.clientId, data.redirectUri);
  });

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
