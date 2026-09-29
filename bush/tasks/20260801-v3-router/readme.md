# 2026-08-01 - V3 Router

Deployment of the Base Router for Bush V3.
Contains `Router` for basic, single step operations (e.g., pool initialization, add, remove, swap).

The Router saves the sender (i.e., uses the `saveSender` modifier) on initialization as well as on add liquidity operations, enabling pools to verify the sender on liquidity operations (e.g., to enforce a single-LP, as in liquidity bootstrapping or treasury management pools).

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`Router` artifact](./artifact/Router.json)
