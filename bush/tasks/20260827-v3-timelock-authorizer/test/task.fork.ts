import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { fp } from '@helpers/numbers';
import { actionId } from '@helpers/models/misc/actions';
import { advanceTime, DAY } from '@helpers/time';
import * as expectEvent from '@helpers/expectEvent';

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import { TimelockAuthorizerDeployment } from '../input';

// The public Robinhood Chain RPC is not archival, so the fork is taken from the current head rather than a fixed block.
describeForkTest('TimelockAuthorizer', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260827-v3-timelock-authorizer';

  let task: Task;
  let input: TimelockAuthorizerDeployment;

  let authorizer: Contract, executionHelper: Contract;
  let vault: Contract, vaultAdmin: Contract, vaultAsAdmin: Contract, vaultAsExtension: Contract;
  let previousAuthorizer: string;

  let root: SignerWithAddress;
  let setAuthorizerActionId: string;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as TimelockAuthorizerDeployment;
    authorizer = await task.deployedInstance('TimelockAuthorizer');
    executionHelper = await task.instanceAt('TimelockExecutionHelper', await authorizer.getTimelockExecutionHelper());
  });

  before('load vault', async () => {
    const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, getForkedNetwork(hre));

    vault = await vaultTask.deployedInstance('Vault');
    vaultAdmin = await vaultTask.deployedInstance('VaultAdmin');

    // VaultAdmin and VaultExtension functions are called on the Vault address.
    vaultAsAdmin = vaultAdmin.attach(vault.target.toString()) as Contract;
    vaultAsExtension = (await vaultTask.deployedInstance('VaultExtension')).attach(vault.target.toString()) as Contract;

    setAuthorizerActionId = await actionId(vaultAdmin, 'setAuthorizer');
  });

  before('record the current authorizer and impersonate root', async () => {
    // Either the `BootstrapAuthorizer` the Vault was deployed with, or the live `TimelockAuthorizer` once governance
    // has switched over. Root is allowed to `setAuthorizer` under both.
    previousAuthorizer = await vaultAsExtension.getAuthorizer();

    root = await impersonate(input.Root, fp(100));
  });

  it('deploys the authorizer with the given configuration', async () => {
    expect(await authorizer.getRoot()).to.be.eq(input.Root);
    expect(await authorizer.getPendingRoot()).to.be.eq(input.NextRoot);
    expect(await authorizer.getVault()).to.be.eq(input.Vault);
    expect(await authorizer.getRootTransferDelay()).to.be.eq(input.RootTransferDelay);
  });

  it('deploys a timelock execution helper owned by the authorizer', async () => {
    expect(await executionHelper.getAuthorizer()).to.be.eq(authorizer.target.toString());
  });

  it('starts with no delays configured', async () => {
    expect(await authorizer.getActionIdDelay(setAuthorizerActionId)).to.be.eq(0);
    expect(await authorizer.getActionIdGrantDelay(setAuthorizerActionId)).to.be.eq(0);
  });

  it('is not the vault authorizer until governance switches it', async () => {
    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(previousAuthorizer);
    expect(previousAuthorizer).to.not.be.eq(authorizer.target.toString());
  });

  it('can be set as the vault authorizer by the current root', async () => {
    // Root is the bootstrap authorizer's owner, and holds `setAuthorizer` on the live timelock authorizer.
    await (vaultAsAdmin.connect(root) as Contract).setAuthorizer(authorizer.target.toString());

    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(authorizer.target.toString());
  });

  it('lets root grant permissions immediately while there is no grant delay', async () => {
    await (authorizer.connect(root) as Contract).grantPermission(
      setAuthorizerActionId,
      root.address,
      vault.target.toString()
    );

    expect(await authorizer.hasPermission(setAuthorizerActionId, root.address, vault.target.toString())).to.be.true;
    expect(await authorizer.canPerform(setAuthorizerActionId, root.address, vault.target.toString())).to.be.true;
  });

  it('only applies a delay change after the minimum change delay', async () => {
    const tx = await (authorizer.connect(root) as Contract).scheduleDelayChange(setAuthorizerActionId, DAY, []);
    const event = expectEvent.inReceipt(await tx.wait(), 'DelayChangeScheduled');

    // Delay changes cannot be executed before MINIMUM_CHANGE_DELAY_EXECUTION_DELAY (5 days) has elapsed.
    await expect(authorizer.execute(event.args.scheduledExecutionId)).to.be.revertedWith(
      'EXECUTION_NOT_YET_EXECUTABLE'
    );

    await advanceTime(await authorizer.MINIMUM_CHANGE_DELAY_EXECUTION_DELAY());
    await authorizer.execute(event.args.scheduledExecutionId);

    expect(await authorizer.getActionIdDelay(setAuthorizerActionId)).to.be.eq(DAY);
  });

  it('requires scheduling actions that have a delay', async () => {
    // Permissioned accounts can no longer perform the action directly: only the execution helper can.
    expect(await authorizer.canPerform(setAuthorizerActionId, root.address, vault.target.toString())).to.be.false;

    await expect(
      (vaultAsAdmin.connect(root) as Contract).setAuthorizer(previousAuthorizer)
    ).to.be.revertedWithCustomError(vaultAsAdmin, 'SenderNotAllowed');
  });

  it('executes a scheduled authorizer change once the delay has elapsed', async () => {
    const tx = await (authorizer.connect(root) as Contract).schedule(
      vault.target.toString(),
      vaultAdmin.interface.encodeFunctionData('setAuthorizer', [previousAuthorizer]),
      []
    );
    const event = expectEvent.inReceipt(await tx.wait(), 'ExecutionScheduled');

    await advanceTime(DAY);
    await authorizer.execute(event.args.scheduledExecutionId);

    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(previousAuthorizer);
  });
});
