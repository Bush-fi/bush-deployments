import { Task, TaskMode } from '@src';

export type AggregatorRouterDeployment = {
  Vault: string;
  RouterVersion: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const BaseVersion = { version: 1, deployment: '20260815-v3-aggregator-router' };

export default {
  Vault,
  RouterVersion: JSON.stringify({ name: 'AggregatorRouter', ...BaseVersion }),
};
