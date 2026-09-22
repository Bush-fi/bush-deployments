import { Task, TaskMode } from '@src';

export type PoolFactoryRegistryDeployment = {
  Vault: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);

export default {
  Vault,
};
