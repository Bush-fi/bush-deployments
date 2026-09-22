import { Task, TaskRunOptions } from '@src';
import { LiquidityZapperDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as LiquidityZapperDeployment;

  const zapperArgs = [input.Vault, input.Router, input.Permit2, input.UmbraRouter];
  await task.deploy('LiquidityZapper', zapperArgs, from, force);
};
