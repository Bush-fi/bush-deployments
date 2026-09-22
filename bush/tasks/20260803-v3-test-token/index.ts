import { Task, TaskRunOptions } from '@src';
import { TestTokenDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as TestTokenDeployment;

  const args = [input.Name, input.Symbol, input.Decimals, input.Supply];
  await task.deployAndVerify('SimpleTestToken', args, from, force);
};
