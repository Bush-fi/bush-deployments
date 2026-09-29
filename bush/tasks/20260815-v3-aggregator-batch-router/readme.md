# 2026-08-15 - V3 Aggregator Batch Router

Contains the `AggregatorBatchRouter`, for complex multi-hop swaps (supports buffer wrap / unwrap). This version of the BatchRouter does not use permit2. The sender pays the required amounts to the Vault up front, avoiding any kind of token approval requirements.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`AggregatorBatchRouter` artifact](./artifact/AggregatorBatchRouter.json)
