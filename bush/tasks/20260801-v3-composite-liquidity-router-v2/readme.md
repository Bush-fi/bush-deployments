# 2026-08-01 - V3 Composite Liquidity Router (V2)

Composite Liquidity Router deployment for Bush V3.
Contains `CompositeLiquidityRouter` for complex liquidity operations involving pools with ERC4626 wrappers.

This is the first Bush deployment of the router. The `v2` in the task ID refers to the version of the design, which:
- Allows individually choosing which tokens to wrap / unwrap for boosted pool operations, as opposed to wrapping / unwrapping automatically. This suits pools with wrappers that are treated like regular tokens (e.g. `sDAI`).
- Excludes nested pool operations.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`CompositeLiquidityRouter` artifact](./artifact/CompositeLiquidityRouter.json)
