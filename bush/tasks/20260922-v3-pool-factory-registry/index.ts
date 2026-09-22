import { Task, TaskRunOptions } from '@src';
import { PoolFactoryRegistryDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as PoolFactoryRegistryDeployment;

  const zapperArgs = [input.Vault];
  await task.deployAndVerify('PoolFactoryRegistry', zapperArgs, from, force);
};
