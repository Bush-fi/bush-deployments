# 2026-09-17 - V3 Liquidity Zapper

Deployment of the `LiquidityZapper`: buys a set of tokens through the Umbra aggregator (umbra.finance) and deposits them as liquidity into a Bush pool in a single transaction. The caller supplies one pre-built Umbra swap per token, all funded from a single input token (ERC20 or native); the resulting tokens are either added to an existing pool or used to seed a brand-new `WeightedPoolFactory` pool. Leftover dust and the minted BPT are forwarded to the recipient.

Constructor arguments are the `Vault`, `Router`, `Permit2` and the governance-set `UmbraRouter` every swap is sent to.

## Useful Files

- [`LiquidityZapper` artifact](./artifact/LiquidityZapper.json)
