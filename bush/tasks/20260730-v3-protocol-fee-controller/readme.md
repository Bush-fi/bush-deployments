# 2026-07-30 - V3 Protocol Fee Controller

Deployment of the `ProtocolFeeController` for the Bush V3 Vault. It emits events on new pool registration, reporting the initial values of the aggregate swap and yield fees, so protocol fee percentages (and whether a pool is protocol fee exempt) can be tracked from events alone.

It is deployed with global protocol swap and yield fees of 50%. The fee controller is replaceable in the Vault through the permissioned `setProtocolFeeController` function.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`ProtocolFeeController` artifact](./artifact/ProtocolFeeController.json)
