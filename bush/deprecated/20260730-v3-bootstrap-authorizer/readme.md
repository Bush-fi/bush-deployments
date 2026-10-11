# 2026-07-30 - V3 Bootstrap Authorizer

Deployment of the `BootstrapAuthorizer`: a minimal `IAuthorizer` whose `canPerform` returns true only for a single, immutable `owner`. The Vault is deployed pointing at it, so the owner can run every permissioned setup step (registering factories, configuring fees, etc.) without any delays. Once bootstrapping is done, the owner hands control over by calling `VaultAdmin.setAuthorizer` with the [`TimelockAuthorizer`](../20260827-v3-timelock-authorizer).

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`BootstrapAuthorizer` artifact](./artifact/BootstrapAuthorizer.json)
