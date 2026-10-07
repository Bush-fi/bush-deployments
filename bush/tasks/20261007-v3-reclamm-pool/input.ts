import { MONTH } from '@helpers/time';
import { Task, TaskMode } from '@src';

export type ReClammPoolDeployment = {
  Vault: string;
  PauseWindowDuration: number;
  WETH: string;
  SimpleTestToken: string;
  FactoryVersion: string;
  PoolVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const SimpleTestToken = new Task('20260803-v3-test-token', TaskMode.READ_ONLY);
const WETH = new Task('000000001-tokens', TaskMode.READ_ONLY);

const BaseVersion = { version: 1, deployment: '20261007-v3-reclamm-pool' };

export default {
  Vault,
  PauseWindowDuration: 75 * 12 * MONTH, // 75 years
  WETH,
  SimpleTestToken,
  FactoryVersion: JSON.stringify({ name: 'ReClammPoolFactory', ...BaseVersion }),
  PoolVersion: JSON.stringify({ name: 'ReClammPool', ...BaseVersion }),
};
