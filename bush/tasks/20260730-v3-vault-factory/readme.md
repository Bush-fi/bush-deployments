# 2026-07-30 - V3 Vault Factory

Deployment of the `VaultFactory`, which was used to deploy the Bush V3 Vault (with its `VaultExtension` and `VaultAdmin`) at the target address `0xB055000fbE3cc9bDE7742C583a86cc6283E3fF85`. The Vault creation code comes from the [`20260730-v3-vault3`](../20260730-v3-vault3) task, and the Vault is deployed pointing at the [`BootstrapAuthorizer`](../20260730-v3-bootstrap-authorizer).

The factory does not deploy a `ProtocolFeeController`: it accepts the fee controller address in the `create` function and passes it through to the Vault. This keeps the factory decoupled from the fee controller version, and reduces the factory's size and the gas needed to deploy the Vault.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`VaultFactory` artifact](./artifact/VaultFactory.json)
