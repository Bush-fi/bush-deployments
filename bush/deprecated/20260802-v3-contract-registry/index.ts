import { BushContractRegistryDeployment } from './input';
import { Task, TaskRunOptions } from '@src';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as BushContractRegistryDeployment;

  await task.deployAndVerify('BushContractRegistry', [input.Vault], from, force);
};
