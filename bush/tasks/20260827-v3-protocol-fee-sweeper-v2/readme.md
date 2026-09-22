# 2025-05-03 - V3 Protocol Fee Sweeper V2

Second deployment of the Protocol Fee Sweeper, a helper contract to convert protocol fees collected in a wide variety of tokens to a common "target" token for the treasury (e.g., USDC).

It does this for each pool by withdrawing tokens from the Protocol Fee Controller to itself, and calling a configurable "burner" contract (e.g., from CowSwap) that does the actual conversion swaps, and forwards the proceeds to a recipient (e.g., the treasury).

This version can unwrap tokens on demand before calling the burner.

## Useful Files

- [Ethereum mainnet addresses](./output/mainnet.json)
- [Gnosis mainnet addresses](./output/gnosis.json)
- [Arbitrum mainnet addresses](./output/arbitrum.json)
- [Base mainnet addresses](./output/base.json)
- [Optimism mainnet addresses](./output/optimism.json)
- [Avalanche mainnet addresses](./output/avalanche.json)
- [Hyperevm mainnet addresses](./output/hyperevm.json)
- [Plasma mainnet addresses](./output/plasma.json)
- [X-Layer mainnet addresses](./output/xlayer.json)
- [Monad mainnet addresses](./output/monad.json)
- [Sepolia testnet addresses](./output/sepolia.json)
- [`ProtocolFeeSweeper` artifact](./artifact/ProtocolFeeSweeper.json)
