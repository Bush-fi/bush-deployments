# 2026-10-01 - V3 Root Change

Transfers root of the [`TimelockAuthorizer`](../../tasks/20260827-v3-timelock-authorizer) from the admin EOA `0xAfb63FBd653A55f180a84076673f4abF9E68232c` to the Safe `0xEF39548241ABb0B8B072BD2C0ce25BB5A326009F` (1-of-1, owned by that same EOA).

This is a script rather than a deployment: it deploys nothing and saves no output, it just sends transactions.

## Steps

Root cannot be handed over directly. `setPendingRoot` can only be called by the `TimelockExecutionHelper`, so the change has to go through a scheduled execution that waits out the `RootTransferDelay` (1 day):

1. **Schedule**: root calls `scheduleRootChange(newRoot, [])`. No executors are set, so anyone may execute it once the delay has passed.
2. **Execute**: after 1 day, anyone calls `execute(id)`, which makes the new root the pending root.
3. **Claim**: the new root calls `claimRoot()`. Root only changes at this point; until then the old root is still in control.

Each run of this script works out which step is due and performs only that one, so it is re-run until it reports that root has changed:

```bash
# Day 0, from the current root: schedules the change.
npx hardhat deploy --id 20261001-v3-root-change --network robinhoodchain

# Day 1, from any account: executes it.
npx hardhat deploy --id 20261001-v3-root-change --network robinhoodchain
```

The new root is a Safe, so step 3 can't be sent by this script: call `claimRoot()` on the `TimelockAuthorizer` (`0x2eA342b2B0EA5519A0c4ee9Ea4AeC25D3223Ea8b`) from the Safe's transaction builder. Running the script once root has changed reports that and does nothing.

## Things to keep in mind

- Permissions are not transferred with root. Everything granted by [`20260827-v3-grant-permissions`](../20260827-v3-grant-permissions) stays with the admin EOA; root can grant any of them to the Safe as well.
- Root is a granter and revoker for every action, so after the claim the Safe is the only account that can grant permissions (or schedule delay changes) unless it adds other granters.
- `NextRoot` in the Authorizer's deployment inputs is only read by the constructor; it is not updated by this change.
