import { Contract } from 'ethers';

import logger from '../../../src/logger';
import { getSigner, Task, TaskMode, TaskRunOptions } from '@src';
import { currentTimestamp } from '@helpers/time';
import { RootChangeDeployment } from './input';

export default async (task: Task, { from }: TaskRunOptions = {}): Promise<void> => {
  // This task sends transactions instead of deploying contracts, so there is nothing to check or verify.
  if (task.mode !== TaskMode.LIVE && task.mode !== TaskMode.TEST) {
    return;
  }

  const input = task.input() as RootChangeDeployment;

  const authorizerTask = new Task(
    '20260827-v3-timelock-authorizer',
    task.mode === TaskMode.TEST ? TaskMode.TEST : TaskMode.READ_ONLY,
    task.network
  );
  const authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

  const sender = from ?? (await getSigner());
  const authorizerAsSender = authorizer.connect(sender) as Contract;
  const newRoot = input.NewRoot;

  // A root change goes through three steps, each of which may be done by a different account and the second of which
  // must wait for the root transfer delay. Every run of this task works out which step is due and performs only that
  // one, so it is simply re-run until root has changed.

  if (await authorizer.isRoot(newRoot)) {
    logger.success(`${newRoot} is already root`);
    return;
  }

  // Step 3: the new root claims. This must come from the new root itself.
  if (await authorizer.isPendingRoot(newRoot)) {
    if (sender.address.toLowerCase() !== newRoot.toLowerCase()) {
      logger.warn(`${newRoot} is pending root: it must now call 'claimRoot()' on ${authorizer.target} itself`);
      return;
    }

    await authorizerAsSender.claimRoot();
    logger.success(`${newRoot} claimed root`);
    return;
  }

  // Step 2: execute a previously scheduled root change once its delay has elapsed. Root changes are scheduled on the
  // authorizer itself, as a call to `setPendingRoot(newRoot)`.
  const setPendingRootData = authorizer.interface.encodeFunctionData('setPendingRoot', [newRoot]).toLowerCase();
  const scheduledCount = Number(await authorizer.getScheduledExecutionsCount());

  for (let id = scheduledCount - 1; id >= 0; id--) {
    const execution = await authorizer.getScheduledExecution(id);
    if (
      execution.where.toLowerCase() !== authorizer.target.toString().toLowerCase() ||
      execution.data.toLowerCase() !== setPendingRootData ||
      execution.executed ||
      execution.canceled
    ) {
      continue;
    }

    const now = await currentTimestamp();
    if (now < execution.executableAt) {
      const executableAt = new Date(Number(execution.executableAt) * 1000).toISOString();
      logger.warn(`Root change to ${newRoot} is scheduled (id ${id}) but not executable until ${executableAt}`);
      return;
    }

    await authorizerAsSender.execute(id);
    logger.success(`Executed root change ${id}: ${newRoot} is now pending root and must call 'claimRoot()'`);
    return;
  }

  // Step 1: schedule the root change. Only the current root can do this.
  if (!(await authorizer.isRoot(sender.address))) {
    throw Error(`Sender ${sender.address} is not root, so it cannot schedule a root change to ${newRoot}`);
  }

  // No executors: once the delay has elapsed, anyone may execute the change.
  await authorizerAsSender.scheduleRootChange(newRoot, []);

  const delay = await authorizer.getRootTransferDelay();
  logger.success(`Scheduled root change to ${newRoot}; re-run this task in ${delay} seconds to execute it`);
};
