import { Task, TaskMode } from '@src';

export type TokenPairRegistryDeployment = {
  Vault: string;
  InitialOwner: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);

// https://github.com/balancer/bal_addresses/blob/43e3e8b2fcfcb8be10553f136ce64cc9290496dc/extras/multisigs.json#L132
const InitialOwner = '0xAfb63FBd653A55f180a84076673f4abF9E68232c';

export default {
  Vault,
  InitialOwner,
};
