import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { fp } from '@helpers/numbers';
import { describeForkTest, getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { GrantPermissionsDeployment } from '../input';
import { TimelockAuthorizerDeployment } from '../../../tasks/20260827-v3-timelock-authorizer/input';

// The public Robinhood Chain RPC is not archival, so the fork is taken from the current head rather than a fixed block.
describeForkTest('GrantPermissions', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260827-v3-grant-permissions';
  const AUTHORIZER_TASK_NAME = '20260827-v3-timelock-authorizer';

  let task: Task, authorizerTask: Task;
  let input: GrantPermissionsDeployment;
  let authorizer: Contract, vaultAsAdmin: Contract, vaultAsExtension: Contract;
  let root: SignerWithAddress;

  before('deploy the authorizer and hand the vault over to it', async () => {
    authorizerTask = new Task(AUTHORIZER_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await authorizerTask.run({ force: true });
    authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

    const authorizerInput = authorizerTask.input() as TimelockAuthorizerDeployment;
    root = await impersonate(authorizerInput.Root, fp(100));

    const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, getForkedNetwork(hre));
    const vault = await vaultTask.deployedInstance('Vault');
    vaultAsAdmin = (await vaultTask.deployedInstance('VaultAdmin')).attach(vault.target.toString()) as Contract;
    vaultAsExtension = (await vaultTask.deployedInstance('VaultExtension')).attach(vault.target.toString()) as Contract;

    await (vaultAsAdmin.connect(root) as Contract).setAuthorizer(authorizer.target.toString());
    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(authorizer.target.toString());
  });

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    input = task.input() as GrantPermissionsDeployment;

    // None of the permissions exist before the task runs.
    for (const permission of input.Permissions) {
      expect(await authorizer.hasPermission(permission.actionId, permission.account, permission.where)).to.be.false;
    }

    await task.run({ force: true, from: root });
  });

  // The functional checks come first: they exercise the three different `where` values the permissions use, which is
  // the part that can silently go wrong (granting on the wrong target still succeeds but leaves the action
  // uncallable), and the public RPC prunes the forked block's state within a few minutes.

  it('grants vault-wide actions on the Vault itself', async () => {
    // `isVaultPaused` is a VaultAdmin function, so it is read through the Vault like the setters.
    await (vaultAsAdmin.connect(root) as Contract).pauseVault();
    expect(await vaultAsAdmin.isVaultPaused()).to.be.true;

    await (vaultAsAdmin.connect(root) as Contract).unpauseVault();
    expect(await vaultAsAdmin.isVaultPaused()).to.be.false;
  });

  it('grants pool-scoped actions on EVERYWHERE', async () => {
    // The pool is not known when the permission is granted, so this only works via the global grant.
    const poolTask = new Task('20260803-v3-stable-pool', TaskMode.READ_ONLY, getForkedNetwork(hre));
    const pool = poolTask.output().MockStablePool;

    const newSwapFeePercentage = fp(0.02);
    await (vaultAsAdmin.connect(root) as Contract).setStaticSwapFeePercentage(pool, newSwapFeePercentage);

    expect(await vaultAsExtension.getStaticSwapFeePercentage(pool)).to.be.eq(newSwapFeePercentage);
  });

  it('grants fee controller actions on the fee controller', async () => {
    const feeControllerTask = new Task(
      '20260730-v3-protocol-fee-controller',
      TaskMode.READ_ONLY,
      getForkedNetwork(hre)
    );
    const feeController = await feeControllerTask.deployedInstance('ProtocolFeeController');

    const newFeePercentage = fp(0.1);
    await (feeController.connect(root) as Contract).setGlobalProtocolSwapFeePercentage(newFeePercentage);

    expect(await feeController.getGlobalProtocolSwapFeePercentage()).to.be.eq(newFeePercentage);
  });

  it('grants every configured permission', async () => {
    for (const permission of input.Permissions) {
      expect(await authorizer.hasPermission(permission.actionId, permission.account, permission.where)).to.be.true;
    }
  });

  it('lets the grantees perform the action directly, with no delay', async () => {
    for (const permission of input.Permissions) {
      expect(await authorizer.canPerform(permission.actionId, permission.account, permission.where)).to.be.true;
      expect(await authorizer.getActionIdDelay(permission.actionId)).to.be.eq(0);
    }
  });

  it('is idempotent', async () => {
    // `grantPermission` reverts on already granted permissions, so a second run must skip them instead.
    await task.run({ force: true, from: root });

    for (const permission of input.Permissions) {
      expect(await authorizer.hasPermission(permission.actionId, permission.account, permission.where)).to.be.true;
    }
  });

  it('does not grant anything to an unrelated account', async () => {
    const other = '0x0000000000000000000000000000000000000042';

    // A sample is enough here, and keeps the number of forked calls (and therefore the runtime) down.
    for (const permission of input.Permissions.slice(0, 5)) {
      expect(await authorizer.hasPermission(permission.actionId, other, permission.where)).to.be.false;
    }
  });
});
