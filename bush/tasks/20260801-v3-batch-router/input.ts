import { Task, TaskMode } from '@src';

export type BatchRouterDeployment = {
  Vault: string;
  WETH: string;
  Permit2: string;
  RouterVersion: string;
  BatchRouterVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const WETH = new Task('000000001-tokens', TaskMode.READ_ONLY);
const Permit2 = new Task('00000000-permit2', TaskMode.READ_ONLY);
const BaseVersion = { version: 1, deployment: '20260801-v3-batch-router' };

export default {
  Vault,
  WETH,
  Permit2,
  BatchRouterVersion: JSON.stringify({ name: 'BatchRouter', ...BaseVersion }),
};
