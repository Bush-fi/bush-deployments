import { Task, TaskMode } from '@src';

export type AggregatorBatchRouterDeployment = {
  Vault: string;
  BatchRouterVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const BaseVersion = { version: 1, deployment: '20260815-v3-aggregator-batch-router' };

export default {
  Vault,
  BatchRouterVersion: JSON.stringify({ name: 'AggregatorBatchRouter', ...BaseVersion }),
};
