import { Contract } from 'ethers';

import logger from '../../../src/logger';
import { getSigner, Task, TaskMode, TaskRunOptions } from '@src';
import { GrantPermissionsDeployment } from './input';

export default async (task: Task, { from }: TaskRunOptions = {}): Promise<void> => {
  // This task sends transactions instead of deploying contracts, so there is nothing to check or verify.
  if (task.mode !== TaskMode.LIVE && task.mode !== TaskMode.TEST) {
    return;
  }

  const input = task.input() as GrantPermissionsDeployment;

  // The Authorizer is read from its own task rather than taken as an input, so that this works both against the live
  // deployment and against one deployed inside a fork test, which saves to a different output file.
  const authorizerTask = new Task(
    '20260827-v3-timelock-authorizer',
    task.mode === TaskMode.TEST ? TaskMode.TEST : TaskMode.READ_ONLY,
    task.network
  );
  const authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

  const sender = from ?? (await getSigner());
  const authorizerAsSender = authorizer.connect(sender) as Contract;

  for (const permission of input.Permissions) {
    const { actionId, account, where, description } = permission;

    if (await authorizer.hasPermission(actionId, account, where)) {
      logger.info(`Already granted: ${description}`);
      continue;
    }

    // Granting is only immediate while the action has no grant delay; otherwise it must be scheduled by a granter
    // and executed once the delay elapses, which this task deliberately does not do.
    const grantDelay = await authorizer.getActionIdGrantDelay(actionId);
    if (grantDelay > 0n) {
      throw Error(
        `Cannot grant '${description}' directly: action ${actionId} has a grant delay of ${grantDelay} seconds. ` +
          `Use 'scheduleGrantPermission' and execute it once the delay has elapsed.`
      );
    }

    if (!(await authorizer.isGranter(actionId, sender.address, where))) {
      throw Error(`Sender ${sender.address} is not a granter for '${description}' (action ${actionId} at ${where})`);
    }

    await authorizerAsSender.grantPermission(actionId, account, where);
    logger.success(`Granted: ${description}`);
  }
};
