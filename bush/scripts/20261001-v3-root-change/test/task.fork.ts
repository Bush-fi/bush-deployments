import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { fp } from '@helpers/numbers';
import { advanceTime, DAY } from '@helpers/time';
import { describeForkTest, getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { RootChangeDeployment } from '../input';
import { TimelockAuthorizerDeployment } from '../../../tasks/20260827-v3-timelock-authorizer/input';

// The public Robinhood Chain RPC is not archival, so the fork is taken from the current head rather than a fixed block.
describeForkTest('RootChange', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20261001-v3-root-change';
  const AUTHORIZER_TASK_NAME = '20260827-v3-timelock-authorizer';

  let task: Task;
  let input: RootChangeDeployment;
  let authorizer: Contract;
  let root: SignerWithAddress, newRoot: SignerWithAddress;

  before('deploy the authorizer', async () => {
    const authorizerTask = new Task(AUTHORIZER_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await authorizerTask.run({ force: true });
    authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

    const authorizerInput = authorizerTask.input() as TimelockAuthorizerDeployment;
    root = await impersonate(authorizerInput.Root, fp(100));

    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    input = task.input() as RootChangeDeployment;
    newRoot = await impersonate(input.NewRoot, fp(100));
  });

  it('schedules the root change', async () => {
    await task.run({ force: true, from: root });

    expect(await authorizer.getScheduledExecutionsCount()).to.be.eq(1);
    expect(await authorizer.isPendingRoot(input.NewRoot)).to.be.false;
  });

  it('does nothing while the delay has not elapsed', async () => {
    await task.run({ force: true, from: root });

    // Re-running neither schedules a second change nor executes the first one early.
    expect(await authorizer.getScheduledExecutionsCount()).to.be.eq(1);
    expect(await authorizer.isPendingRoot(input.NewRoot)).to.be.false;
  });

  it('executes the root change once the delay has elapsed', async () => {
    await advanceTime(DAY);
    await task.run({ force: true, from: root });

    expect(await authorizer.isPendingRoot(input.NewRoot)).to.be.true;
    expect(await authorizer.isRoot(root.address)).to.be.true;
  });

  it('does not claim on behalf of the new root', async () => {
    await task.run({ force: true, from: root });

    expect(await authorizer.isRoot(root.address)).to.be.true;
    expect(await authorizer.isRoot(input.NewRoot)).to.be.false;
  });

  it('lets the new root claim', async () => {
    await task.run({ force: true, from: newRoot });

    expect(await authorizer.isRoot(input.NewRoot)).to.be.true;
    expect(await authorizer.isRoot(root.address)).to.be.false;
  });

  it('is a no-op once root has changed', async () => {
    await task.run({ force: true, from: root });

    expect(await authorizer.isRoot(input.NewRoot)).to.be.true;
  });
});
