import { MONTH } from '@helpers/time';
import { Task, TaskMode } from '@src';

export type StablePoolDeployment = {
  Vault: string;
  PauseWindowDuration: number;
  SimpleTestToken: string;
  WETH: string;
  FactoryVersion: string;
  PoolVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const SimpleTestToken = new Task('20260803-v3-test-token', TaskMode.READ_ONLY);
const WETH = new Task('000000001-tokens', TaskMode.READ_ONLY);

const BaseVersion = { version: 1, deployment: '20260803-v3-stable-pool' };

export default {
  Vault,
  PauseWindowDuration: 75 * 12 * MONTH, // 75 years
  SimpleTestToken,
  WETH,
  FactoryVersion: JSON.stringify({ name: 'StablePoolFactory', ...BaseVersion }),
  PoolVersion: JSON.stringify({ name: 'StablePool', ...BaseVersion }),
};
