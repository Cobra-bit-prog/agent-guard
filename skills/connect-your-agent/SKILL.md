---
name: connect-your-agent
description: Connect your agent to Agent Control. Use when adding the MCP connector, checking a spend, or explaining hold vs block.
---

# Connect your agent

External audit for your agents. You keep the keys.

The remote MCP is Streamable HTTP at `https://agent-control.net/api/v1/mcp`. Auth header: `Authorization: Bearer ${AGENT_CONTROL_API_KEY}`. `get_pricing` is public. Spend checks, checkout, and status need the key.

Before every send, call `check_transfer`. If the decision is hold, poll `get_approval` until allow or block. If `must_abort` is true, do not send.

Hold vs block waits in Approval Inbox. If the agent skips the check, Inbox cannot stop that send.

How to connect: https://agent-control.net/docs#connectors
