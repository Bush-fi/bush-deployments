# 2026-10-07 - V3 ReClamm Pool

Deployment of the `ReClammPoolFactory` for Bush V3, together with the `ReClammPoolHelper` it depends on.

ReClamm (readjusting concentrated liquidity AMM) pools are two-token pools that concentrate liquidity within a price range, using virtual balances on top of constant-product math. Unlike fixed-range concentrated liquidity, the range follows the market: when the pool drifts too far from the center of its range (its centeredness falls below the `centerednessMargin`), the virtual balances gradually shift the range toward the current price, at a speed set by the `dailyPriceShiftExponent`. This makes them suited to pairs that trade within a fairly predictable band, without LPs having to manage positions.

Pools are created with an initial min, max and target price for token A in terms of token B. The factory enforces:
- At most two tokens, with unbalanced liquidity and donations disabled (proportional joins and exits only). The pool is its own hook.
- A max/min price ratio between 1.0001 and 20.
- A target price inside the range that clears the centeredness margin. Placing it near the geometric center of the range (√(min × max)) starts the pool fully centered.
- A centeredness margin of at most 90%, and a daily price shift exponent of at most 50% (or 0 to disable range shifting).
- A swap fee between 0.001% and 10%.

Pools may hold rate-bearing tokens (e.g. ERC4626 wrappers). The `tokenAPriceIncludesRate` / `tokenBPriceIncludesRate` flags say whether the initial prices are given in terms of the wrapped token or its underlying. The rate is only applied at initialization, so only slow-moving, monotonic rates are a good fit. See the notes in `ReClammPoolFactoryLib` before using a rate provider that anyone can move.

The pool's swap fee manager (or governance, if none is set) can update the centeredness margin and daily price shift exponent, and start or stop a gradual price ratio update.

The `ReClammPoolHelper` is a stateless contract with the off-chain and initialization calculations that don't fit in the pool's bytecode. Use `computeInitialBalancesRaw` to get the exact token amounts to initialize a pool with, since initialization reverts if the balance ratio is more than 0.01% from the target. The factory rejects a helper deployed with a different Vault.

The factory has a 75-year pause window, and allows setting the pool creator on pool deployment. This is the first Bush deployment, so the factory and pool version metadata report `version: 1`.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`ReClammPoolFactory` artifact](./artifact/ReClammPoolFactory.json)
- [`ReClammPool` artifact](./artifact/ReClammPool.json)
- [`ReClammPoolHelper` artifact](./artifact/ReClammPoolHelper.json)
