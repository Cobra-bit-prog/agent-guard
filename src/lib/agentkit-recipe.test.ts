import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENTKIT_RECIPE_CODE, AGENTKIT_RECIPE_STEPS } from "./agentkit-recipe.ts";

describe("AgentKit policy recipe", () => {
  it("uses createAgentKitPolicyProvider and an API key", () => {
    assert.match(AGENTKIT_RECIPE_CODE, /createAgentKitPolicyProvider/);
    assert.match(AGENTKIT_RECIPE_CODE, /AGENT_CONTROL_API_KEY/);
    assert.match(AGENTKIT_RECIPE_CODE, /src\/adapters\/agentkit\.ts/);
    assert.doesNotMatch(AGENTKIT_RECIPE_CODE, /\bbroadcast/i);
  });

  it("starts from daily cap plus approval threshold, then Connect your agent", () => {
    const prose = AGENTKIT_RECIPE_STEPS.join(" ");
    assert.match(prose, /daily cap/);
    assert.match(prose, /approval threshold/);
    assert.match(prose, /Connect your agent/);
    assert.match(prose, /hold vs block/);
    assert.match(prose, /You keep the keys/);
  });
});
