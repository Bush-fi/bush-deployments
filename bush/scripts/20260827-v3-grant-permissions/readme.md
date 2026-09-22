# 2026-08-27 - V3 Grant Permissions

Grants the initial set of `TimelockAuthorizer` permissions after the Authorizer has been deployed and the Vault has been pointed at it.

This is a script rather than a deployment: it deploys nothing and saves no output, it just sends `grantPermission` calls from root. It is idempotent — permissions that are already granted are skipped — so it can be re-run after adding entries to [`input.ts`](./input.ts).

## Permissions

37 grants, all to the admin except where noted. The `where` of a permission is the contract that *checks* it, which is not always the contract the function is declared on.

### Vault — granted on the Vault (`VaultAdmin` runs by delegate call, so `address(this)` is the Vault)

`pauseVault()`, `unpauseVault()`, `pauseVaultBuffers()`, `unpauseVaultBuffers()`, `enableQuery()`, `disableQuery()`, `disableQueryPermanently()`, `enableRecoveryMode(address)`, `disableRecoveryMode(address)`, `setProtocolFeeController(address)`, `setAuthorizer(address)`

### Vault, pool-scoped — granted on `EVERYWHERE`

`pausePool(address)`, `unpausePool(address)`, `setStaticSwapFeePercentage(address,uint256)`

These check `where == pool` (deferring to governance when the pool has no pause manager or swap fee manager), so a grant on the Vault would not authorize anything. The global grant covers pools that do not exist yet.

### ProtocolFeeController — granted on the fee controller

`setGlobalProtocolSwapFeePercentage(uint256)`, `setGlobalProtocolYieldFeePercentage(uint256)`, `setProtocolSwapFeePercentage(address,uint256)`, `setProtocolYieldFeePercentage(address,uint256)`, `withdrawProtocolFees(address,address)`, `withdrawProtocolFeesForToken(address,address,address)`

`withdrawProtocolFeesForToken` is additionally granted to the **`ProtocolFeeSweeper`**: it withdraws a single fee token to itself before handing it to a burner, and without this every sweep reverts.

### ProtocolFeeSweeper — granted on the sweeper

`sweepProtocolFeesForToken(...)`, `sweepProtocolFeesForWrappedToken(...)`, `setFeeRecipient(address)`, `setTargetToken(address)`, `addProtocolFeeBurner(address)`, `removeProtocolFeeBurner(address)`

The admin is already the sweeper's `feeRecipient`, and `onlyFeeRecipientOrGovernance` short-circuits for it, so these are redundant today. They are granted anyway so the admin keeps control if the fee recipient is ever changed.

### BushContractRegistry — granted on the registry

`registerBushContract(uint8,string,address)`, `deregisterBushContract(string)`, `deprecateBushContract(address)`, `addOrUpdateBushContractAlias(string,address)`

### TokenPairRegistry — granted on the registry

`addPath(address,(address,address,bool)[])`, `addSimplePath(address)`, `removePathAtIndex(address,address,uint256)`, `removeSimplePath(address)`

### Pool factories — granted on each factory

`StablePoolFactory.disable()`, `WeightedPoolFactory.disable()`. Pool creation is permissionless, so `disable()` is the only gated function.

### Deliberately not granted

Functions that are not gated by the Authorizer at all: the Vault's buffer entry points (`initializeBuffer`, `addLiquidityToBuffer`, `removeLiquidityFromBuffer`) are permissionless, `collectAggregateFees` and `updateAggregate*FeePercentage` are restricted to the fee controller, `TokenPairRegistry`'s ownership functions are `Ownable2Step`, and the factories' `create` is permissionless.

## Requirements

- The `TimelockAuthorizer` must be deployed, and the Vault's authorizer must already be set to it.
- The sender must be root, or a granter for each action. Root is a granter for everything.
- The actions must have no grant delay. This is the case with the delays currently configured in the [Timelock Authorizer settings](../../tasks/20260827-v3-timelock-authorizer/settings.ts), which are empty. The task fails loudly rather than half-applying if a grant delay is ever set.

## Usage

```bash
npx hardhat deploy --id 20260827-v3-grant-permissions --network robinhoodchain
```
