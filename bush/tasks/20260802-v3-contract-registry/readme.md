# 2025-01-17 - V3 Contract Registry

`BushContractRegistry` maintains a registry of official Bush Factories, Routers, Hooks, and valid ERC4626 tokens, for two main purposes. The first is to support the many instances where we need to know that a contract is "trusted" (i.e., is safe and behaves in the required manner). The second use case is for off-chain queries, or other protocols that need to easily determine, say, the "latest" Weighted Pool Factory.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`BushContractRegistry` artifact](./artifact/BushContractRegistry.json)
