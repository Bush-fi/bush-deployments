# 2026-10-11 - V3 Set Authorizer

Points the Vault at the [`TimelockAuthorizer`](../../tasks/20260827-v3-timelock-authorizer), replacing the [`BootstrapAuthorizer`](../../tasks/20260730-v3-bootstrap-authorizer) it was deployed with.

This is a script rather than a deployment: it deploys nothing and saves no output, it just calls `VaultAdmin.setAuthorizer` on the Vault.

## Requirements

- The sender must be the `BootstrapAuthorizer` owner, the admin EOA `0xAfb63FBd653A55f180a84076673f4abF9E68232c`.
- Every permission from [`20260827-v3-grant-permissions`](../20260827-v3-grant-permissions) must already be granted.

The switch cannot be undone by the sender: afterwards, only accounts holding permissions on the `TimelockAuthorizer` can act on the Vault. So before sending anything the script checks that:

- the `TimelockAuthorizer` was deployed for this Vault;
- every permission from the grant task is in place, and fails listing the missing ones otherwise;
- the admin Safe `0xEF39548241ABb0B8B072BD2C0ce25BB5A326009F` can call `setAuthorizer` through the new Authorizer, so the Vault can still be pointed elsewhere later.

Once the Vault already uses the `TimelockAuthorizer`, running the script reports that and does nothing.

## Usage

```bash
npx hardhat deploy --id 20261011-v3-set-authorizer --network robinhoodchain
```
