# 2025-03-07 - V3 Router V2

Redeployment of the Base Router for V3.
Contains `Router` for basic, single step operations (e.g., pool initialization, add, remove, swap).

The original router can still be used. The difference is this version saves the sender (i.e., uses the `saveSender` modifier) on initialization as well as on add liquidity operations, enabling pools to verify the sender on liquidity operations (e.g., to enforce a single-LP, as in liquidity bootstrapping or treasury management pools).

There were also other changes to the Router contract and inheritance hierarchy since the original deployment (e.g., introduction of WethLib and `SenderGuard` in `RouterCommon`), but these are refactors designed to make router development easier (e.g., for the AggregatorRouter), and are not semantic or interface changes.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`Router` artifact](./artifact/Router.json)

