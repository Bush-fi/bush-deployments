import { Task, TaskMode } from '@src';

export type AddViaSwapRouterDeployment = {
  Vault: string;
  Permit2: string;
  WETH: string;
  RouterVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const Permit2 = new Task('00000000-permit2', TaskMode.READ_ONLY);
const WETH = new Task('000000001-tokens', TaskMode.READ_ONLY);
const BaseVersion = { version: 1, deployment: '20260802-v3-unbalanced-add-via-swap-router' };

export default {
  Vault,
  Permit2,
  WETH,
  RouterVersion: JSON.stringify({ name: 'UnbalancedAddViaSwapRouter', ...BaseVersion }),
};
