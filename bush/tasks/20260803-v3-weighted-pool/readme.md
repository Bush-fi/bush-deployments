# 2026-08-03 - V3 Weighted Pool

Deployment of the `WeightedPoolFactory` for Bush V3.
Pools from this factory use weighted math, which is best suited for uncorrelated assets (full price range).

The factory has a 75-year pause window, and allows setting the pool creator on pool deployment. This is the first Bush deployment, but the factory and pool version metadata report `version: 2`, following the upstream design it is based on.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`WeightedPoolFactory` artifact](./artifact/WeightedPoolFactory.json)
- [`WeightedPool` artifact](./artifact/WeightedPool.json)
