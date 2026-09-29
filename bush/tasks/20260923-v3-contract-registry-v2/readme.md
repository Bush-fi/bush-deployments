# 2026-09-23 - V3 Contract Registry V2

`BushContractRegistry` maintains a registry of official Bush Factories, Routers, Hooks, and valid ERC4626 tokens, for two main purposes. The first is to support the many instances where we need to know that a contract is "trusted" (i.e., is safe and behaves in the required manner). The second use case is for off-chain queries, or other protocols that need to easily determine, say, the "latest" Weighted Pool Factory.

This version has the following differences with respect to the [previous one](../../deprecated/20260802-v3-contract-registry):
- Pool factories are registered through `registerPoolFactory`, which also records the pool type (e.g. `WEIGHTED`, `STABLE`), hook mode and hook of each factory. Integrators can query these with `getPoolFactoriesByType` and `isPoolOfType` to validate factories consistently.

The registry is populated by [`20260830-v3-registry-initializer`](../../scripts/20260830-v3-registry-initializer).

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`BushContractRegistry` artifact](./artifact/BushContractRegistry.json)
