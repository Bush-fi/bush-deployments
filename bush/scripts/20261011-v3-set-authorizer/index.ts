import { Contract } from 'ethers';

import logger from '../../../src/logger';
import { getSigner, Task, TaskMode, TaskRunOptions } from '@src';
import { SetAuthorizerDeployment } from './input';
import { GrantPermissionsDeployment } from '../20260827-v3-grant-permissions/input';

export default async (task: Task, { from }: TaskRunOptions = {}): Promise<void> => {
  // This task sends transactions instead of deploying contracts, so there is nothing to check or verify.
  if (task.mode !== TaskMode.LIVE && task.mode !== TaskMode.TEST) {
    return;
  }

  const input = task.input() as SetAuthorizerDeployment;

  // The Authorizer is read from its own task rather than taken as an input, so that this works both against the live
  // deployment and against one deployed inside a fork test, which saves to a different output file.
  const authorizerTask = new Task(
    '20260827-v3-timelock-authorizer',
    task.mode === TaskMode.TEST ? TaskMode.TEST : TaskMode.READ_ONLY,
    task.network
  );
  const authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');
  const newAuthorizer = authorizer.target.toString();

  // VaultAdmin and VaultExtension run as delegate calls from the Vault, so both are called at the Vault's address.
  const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, task.network);
  const vaultAsAdmin = (await vaultTask.deployedInstance('VaultAdmin')).attach(input.Vault) as Contract;
  const vaultAsExtension = (await vaultTask.deployedInstance('VaultExtension')).attach(input.Vault) as Contract;

  const currentAuthorizer = await vaultAsExtension.getAuthorizer();
  if (currentAuthorizer.toLowerCase() === newAuthorizer.toLowerCase()) {
    logger.success(`The Vault already uses the TimelockAuthorizer at ${newAuthorizer}`);
    return;
  }

  // Switching is irreversible from the sender's side: once it's done, only accounts holding permissions on the new
  // Authorizer can act on the Vault. Everything below makes sure that set is complete before handing over.

  if ((await authorizer.getVault()).toLowerCase() !== input.Vault.toLowerCase()) {
    throw Error(`The TimelockAuthorizer at ${newAuthorizer} was deployed for a different Vault`);
  }

  // Every permission from the grant task must be in place, or some action becomes uncallable after the switch.
  const grantTask = new Task('20260827-v3-grant-permissions', TaskMode.READ_ONLY, task.network);
  const { Permissions } = grantTask.input() as GrantPermissionsDeployment;
  const missing = [];
  for (const { actionId, account, where, description } of Permissions) {
    if (!(await authorizer.canPerform(actionId, account, where))) {
      missing.push(description);
    }
  }
  if (missing.length > 0) {
    throw Error(
      `${missing.length} permission(s) are not in place on the TimelockAuthorizer; run ` +
        `'20260827-v3-grant-permissions' first:\n  ${missing.join('\n  ')}`
    );
  }

  // Covered by the loop above, but checked explicitly because it's the one that matters: without it, the Vault can
  // never be pointed at a different Authorizer again.
  const setAuthorizerActionId = vaultTask.actionId('VaultAdmin', 'setAuthorizer(address)');
  if (!(await authorizer.canPerform(setAuthorizerActionId, input.Admin, input.Vault))) {
    throw Error(`${input.Admin} cannot call 'setAuthorizer' through the new Authorizer`);
  }

  const sender = from ?? (await getSigner());
  await (vaultAsAdmin.connect(sender) as Contract).setAuthorizer(newAuthorizer);

  const updatedAuthorizer = await vaultAsExtension.getAuthorizer();
  if (updatedAuthorizer.toLowerCase() !== newAuthorizer.toLowerCase()) {
    throw Error(`Vault authorizer is ${updatedAuthorizer} after the call, expected ${newAuthorizer}`);
  }

  logger.success(`Vault authorizer changed from ${currentAuthorizer} to ${newAuthorizer}`);
};
