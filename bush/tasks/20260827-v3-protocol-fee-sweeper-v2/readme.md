# 2026-08-27 - V3 Protocol Fee Sweeper (V2)

Deployment of the Protocol Fee Sweeper, a helper contract to convert protocol fees collected in a wide variety of tokens to a common "target" token for the treasury (e.g., USDC).

It does this for each pool by withdrawing tokens from the Protocol Fee Controller to itself, and calling a configurable "burner" contract (e.g., from CowSwap) that does the actual conversion swaps, and forwards the proceeds to a recipient (e.g., the treasury).

This is the first Bush deployment of the sweeper. The `v2` in the task ID refers to the version of the design, which can unwrap tokens on demand before calling the burner.

The sweeper needs the `withdrawProtocolFeesForToken` permission on the Protocol Fee Controller, granted by [`20260827-v3-grant-permissions`](../../scripts/20260827-v3-grant-permissions).

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`ProtocolFeeSweeper` artifact](./artifact/ProtocolFeeSweeper.json)
