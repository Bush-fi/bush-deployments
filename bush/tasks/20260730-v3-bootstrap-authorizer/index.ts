import { Task, TaskRunOptions } from '@src';
import input from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const migrator = await task.deployAndVerify('BootstrapAuthorizer', [input], from, force);

  task.save({ BootstrapAuthorizer: migrator });
};
