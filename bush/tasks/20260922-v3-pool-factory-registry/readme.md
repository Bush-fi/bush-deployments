# 2026-09-22 - V3 Pool Factory Registry

Deployment of the `PoolFactoryRegistry`: an on-chain registry of the pool factories approved for the V3 Vault. Each entry records the factory's name (usually its deployment task id), pool type (e.g. `WEIGHTED`, `STABLE`), hook mode (`NONE`, `OPTIONAL` or `SPECIFIC`) and, for `SPECIFIC`, the hook attached to every pool it deploys. Factories can be deregistered or deprecated in place.

## Useful Files

- [Robinhoodchain addresses](./output/robinhoodchain.json)
- [`PoolFactoryRegistry` artifact](./artifact/PoolFactoryRegistry.json)
