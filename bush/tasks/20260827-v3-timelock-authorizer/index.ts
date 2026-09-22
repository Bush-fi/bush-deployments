import { Task, TaskRunOptions } from '@src';
import { TimelockAuthorizerDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as TimelockAuthorizerDeployment;

  const authorizerArgs = [input.Root, input.NextRoot, input.Vault, input.RootTransferDelay];
  const authorizer = await task.deployAndVerify('TimelockAuthorizer', authorizerArgs, from, force);

  // The TimelockExecutionHelper is deployed by the TimelockAuthorizer's constructor rather than by this task, so we
  // fetch its address from the Authorizer and save and verify it manually.
  const executionHelper = await task.instanceAt(
    'TimelockExecutionHelper',
    await authorizer.getTimelockExecutionHelper()
  );

  task.save({ TimelockExecutionHelper: executionHelper });
  await task.verify('TimelockExecutionHelper', executionHelper.target.toString(), []);
};
