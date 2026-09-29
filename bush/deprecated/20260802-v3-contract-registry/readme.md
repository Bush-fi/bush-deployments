# 2026-08-02 - V3 Contract Registry

> ⚠️ **DEPRECATED: superseded by the [V3 Contract Registry V2](../../tasks/20260923-v3-contract-registry-v2)**, which also records the pool type, hook mode and hook of each registered pool factory. ⚠️

`BushContractRegistry` maintains a registry of official Bush Factories, Routers, Hooks, and valid ERC4626 tokens, for two main purposes. The first is to support the many instances where we need to know that a contract is "trusted" (i.e., is safe and behaves in the required manner). The second use case is for off-chain queries, or other protocols that need to easily determine, say, the "latest" Weighted Pool Factory.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`BushContractRegistry` artifact](./artifact/BushContractRegistry.json)
