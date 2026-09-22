# 2026-08-30 - V3 Registry Initializer

Populates the [`BushContractRegistry`](../../tasks/20260802-v3-contract-registry) with the deployed routers and pool
factories, and points the short aliases at them.

Unlike Balancer's [`20250411-balancer-registry-initializer-v2`](../../../v3/scripts/20250411-balancer-registry-initializer-v2),
this deploys no contract: there is no `BushContractRegistryInitializer` artifact, and the admin already holds both
registry permissions from [`20260827-v3-grant-permissions`](../20260827-v3-grant-permissions), so the script simply
sends the calls itself. The tradeoff is that it is a transaction per entry rather than one atomic call, so a failure
partway through leaves the registry half-populated; re-running finishes the job.

## Inputs

`Registrations` is a list of `{ contractType, name, address, contractAlias? }`:

- `contractType` mirrors the `ContractType` enum in `IBushContractRegistry`. `ROUTER` is the consequential one:
  `isTrustedRouter` is exactly `isActiveBushContract(ROUTER, ...)`, so registering a contract under it is what makes
  pools believe the sender that contract reports.
- `name` is the registry's unique key, and is the task ID, so successive versions can coexist.
- `contractAlias` is the short name integrators look up (`Router`, `StablePool`), re-pointed at the newest deployment
  as versions ship. An address must be registered before it can be aliased, and names and aliases share a namespace:
  an alias cannot collide with a registered name, or vice versa.

The `BufferRouter` is registered with no alias, matching upstream - it is driven by the Vault's buffer machinery
rather than looked up by name.

## Prerequisites

`registerBushContract` and `addOrUpdateBushContractAlias` are both `authenticate`, so the sender has to be authorized
by whichever Authorizer the Vault currently points at. There is no ordering constraint against the Authorizer
handover:

- While the Vault still points at the [`BootstrapAuthorizer`](../../tasks/20260730-v3-bootstrap-authorizer), whose
  `canPerform` returns true for its owner on every action, the admin can run this immediately.
- After the handover to [`20260827-v3-timelock-authorizer`](../../tasks/20260827-v3-timelock-authorizer), the admin's
  explicit grants from [`20260827-v3-grant-permissions`](../20260827-v3-grant-permissions) cover both registry
  actions, so it still works - but that task has to have run first.

Either way the script checks both permissions up front, and fails with a readable error rather than a bare revert
partway through the list.

## Usage

```bash
npx hardhat deploy --id 20260830-v3-registry-initializer --network robinhoodchain
```

It is idempotent: already-registered addresses and already-correct aliases are skipped, so it is safe to re-run after
adding entries or after a partial failure. Registering an address that is already in the registry under a different
type is not something the script can resolve, so it throws instead.
