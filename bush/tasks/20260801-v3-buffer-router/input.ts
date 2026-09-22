import { Task, TaskMode } from '@src';

export type BufferRouterDeployment = {
  Vault: string;
  WETH: string;
  Permit2: string;
  BufferRouterVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const WETH = new Task('000000001-tokens', TaskMode.READ_ONLY);
const Permit2 = new Task('00000000-permit2', TaskMode.READ_ONLY);
const BaseVersion = { version: 1, deployment: '20260801-v3-buffer-router' };

export default {
  Vault,
  WETH,
  Permit2,
  BufferRouterVersion: JSON.stringify({ name: 'BufferRouter', ...BaseVersion }),
};
