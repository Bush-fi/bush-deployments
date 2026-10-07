# 2026-09-28 - V3 Multi-Router Liquidity Zapper

Deployment of the `MultiRouterLiquidityZapper`: buys a set of tokens through one or more DEX aggregators and deposits them as liquidity into a Bush pool in a single transaction. The caller supplies one pre-built swap per token, all funded from a single input token (ERC20 or native); the resulting tokens are either added to an existing pool or used to seed a brand-new `WeightedPoolFactory` pool. Leftover dust and the minted BPT are forwarded to the recipient.

This version has the following differences with respect to the [previous one](../20260917-v3-zapper):
- Each swap names the router its calldata is sent to, so a single zap can mix aggregators (e.g. the best quote per leg). Routers must be on a governance-managed allowlist (`setSwapRouterAllowed`), initially Umbra and KyberSwap.
- Each router is approved exactly its swap's `amountIn` immediately before its call and revoked immediately after, so no router holds a standing allowance.
- Joins into existing pools are proportional, avoiding the swap fee on unbalanced joins and working on pools with unbalanced liquidity disabled. Tokens that don't fit the pool's ratio are returned to the recipient.
- Governance can `rescue` tokens sent to the contract by mistake.

Constructor arguments are the `Vault`, `Router`, `Permit2` and the initial list of allowlisted swap routers.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`MultiRouterLiquidityZapper` artifact](./artifact/MultiRouterLiquidityZapper.json)
