# 2026-10-07 - V3 ERC4626 Rate Provider Factory

Deployment of the `ERC4626RateProviderFactory`, a permissionless factory for `ERC4626RateProvider` contracts.

An `ERC4626RateProvider` wraps a single ERC4626 vault and reports the value of one share in terms of the vault's underlying asset, as an 18-decimal fixed point number (`getRate()`, computed with `convertToAssets`). This is the rate a Bush V3 pool needs when an ERC4626 token is registered as a `WITH_RATE` token, e.g. for boosted pools or yield-bearing stable pools. The share/asset decimal difference is accounted for at construction, so the rate is always 18 decimals regardless of the vault's decimals.

Anyone can call `create(erc4626)` to deploy a rate provider for a vault; each call emits `RateProviderCreated` and deploys a new contract, even for a vault that already has one. Pool creators and integrators should use `isRateProviderFromFactory` to confirm a rate provider is a genuine, unmodified `ERC4626RateProvider` before trusting it.

The factory has no constructor arguments, owner or permissioned functions, so it needs no action-id grants. No mock rate provider is created as part of this deployment.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`ERC4626RateProviderFactory` artifact](./artifact/ERC4626RateProviderFactory.json)
- [`ERC4626RateProvider` artifact](./artifact/ERC4626RateProvider.json)
