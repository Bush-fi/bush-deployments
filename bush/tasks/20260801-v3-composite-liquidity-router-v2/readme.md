# 2025-01-23 - V3 Composite Liquidity Router (V2)

Composite Liquidity Router deployment for Bush V3, version 2.
Contains `CompositeLiquidityRouter` for complex liquidity operations involving pools with ERC4626 wrappers.

This release has the following differences with respect to the [previous one](../../deprecated/20241205-v3-composite-liquidity-router/):
- Allows individually choosing which tokens to wrap / unwrap for boosted pool operations, as opposed to wrapping / unwrapping automatically.
- Excludes nested pool operations.

Composite Liquidity Router V1 is still safe to use, although its automatic wrap / unwrap mechanism is not well suited for pools with wrappers that are treated like regular tokens (e.g. `sDAI`).

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`CompositeLiquidityRouter` artifact](./artifact/CompositeLiquidityRouter.json)
