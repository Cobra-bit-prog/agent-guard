import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LOCKED = [
  "External audit for your agents",
  "Connect your agent",
  "You keep the keys",
  "hold vs block",
] as const;

describe("Cursor plugin package", () => {
  const plugin = JSON.parse(read(".cursor-plugin/plugin.json")) as {
    name: string;
    mcpServers: string;
    homepage: string;
    variables: {
      type: string;
      properties: { AGENT_CONTROL_API_KEY: { type: string } };
      required: string[];
    };
  };
  const mcp = JSON.parse(read("mcp.json")) as {
    mcpServers: {
      "agent-control": { url: string; headers: { Authorization: string } };
    };
  };

  it("points at the live Streamable HTTP MCP with Bearer plugin variable", () => {
    assert.equal(plugin.name, "agent-control");
    assert.equal(plugin.mcpServers, "./mcp.json");
    assert.equal(plugin.homepage, "https://agent-control.net/docs#connectors");
    assert.equal(plugin.variables.type, "object");
    assert.equal(plugin.variables.properties.AGENT_CONTROL_API_KEY.type, "string");
    assert.deepEqual(plugin.variables.required, ["AGENT_CONTROL_API_KEY"]);
    assert.equal(mcp.mcpServers["agent-control"].url, "https://agent-control.net/api/v1/mcp");
    assert.equal(
      mcp.mcpServers["agent-control"].headers.Authorization,
      "Bearer ${AGENT_CONTROL_API_KEY}",
    );
  });

  it("keeps locked phrases and never says broadcast", () => {
    const pack = [
      read(".cursor-plugin/plugin.json"),
      read("mcp.json"),
      read("CONNECTORS.md"),
      read("skills/connect-your-agent/SKILL.md"),
      read("src/routes/docs.tsx"),
    ].join("\n");
    for (const phrase of LOCKED) {
      assert.match(pack, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(pack, /\bbroadcast/i);
    assert.match(read("src/routes/docs.tsx"), /id="connectors"/);
    assert.match(read("CONNECTORS.md"), /Cursor Customize \/ MCPs/);
    assert.match(read("CONNECTORS.md"), /Grok Bot Plugins/);
    assert.match(read("CONNECTORS.md"), /Grok\.com → connectors → Custom/);
  });
});
