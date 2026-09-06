/**
 * Copy-paste AgentKit recipe: daily cap + approval threshold, then
 * Connect your agent with createAgentKitPolicyProvider.
 */

export const AGENTKIT_RECIPE_CODE = `import { createAgentKitPolicyProvider } from "./src/adapters/agentkit.ts";

const policyProvider = createAgentKitPolicyProvider({
  apiKey: process.env.AGENT_CONTROL_API_KEY,
});
// Pass policyProvider into AgentKit BasePayConfig
`;

export const AGENTKIT_RECIPE_STEPS = [
  "In the console, set a daily cap and an approval threshold (max single send).",
  "Create an API key for that agent.",
  "Connect your agent with this helper. Over the line → hold vs block. You keep the keys.",
] as const;
