# Agent Control

**[External audit for your agents](https://agent-control.net)** — agent payments control for wallets on Solana, Ethereum, and Base.

Not a package scanner — this is spend control for agent wallets.

You set spend limits. Connect your agent so it asks before every send. Off-policy or first-time destinations wait in Approval Inbox (hold vs block). Agent Audit is an on-demand Excel or PDF of the check trail. Optional warning emails (Settings → Email alerts) ping you for a policy alert, spend near the daily cap, or a hold waiting in Inbox. Inbox holds can also POST a Slack incoming webhook if configured. No action within 10 minutes = block. You keep the keys. Not a custodian.

If the agent skips the check, Inbox cannot stop that send.

- Product: [https://agent-control.net](https://agent-control.net)
- Docs: [https://agent-control.net/docs](https://agent-control.net/docs)
- Adapters (AgentKit + x402): copy [`src/adapters`](./src/adapters) so the agent checks before send — [docs](https://agent-control.net/docs#adapters)
- For AI crawlers: [https://agent-control.net/llms.txt](https://agent-control.net/llms.txt)

1-day full console trial, no card, no KYC. Then Starter $29 / Pro $49 / Team $149 from Billing (on-chain USDC, SOL, or ETH).

Contact: [support@agent-control.net](mailto:support@agent-control.net)
