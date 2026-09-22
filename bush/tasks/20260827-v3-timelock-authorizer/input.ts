import { DAY } from '@helpers/time';
import { Task, TaskMode } from '@src';

export type TimelockAuthorizerDeployment = {
  Vault: string;
  Root: string;
  NextRoot: string;
  RootTransferDelay: number;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);

// Owner of the `BootstrapAuthorizer` the Vault is currently pointing at, and the account that will have to call
// `VaultAdmin.setAuthorizer` to hand control over to this Authorizer once it's deployed.
const RobinhoodchainAdmin = '0xAfb63FBd653A55f180a84076673f4abF9E68232c';

// Replacing the Authorizer is the most sensitive action in the system: no other delay can be longer than this one.
const RootTransferDelay = DAY;

export default {
  Vault,
  robinhoodchain: {
    // Root is set directly in the constructor: there is no migrator contract performing any setup on our behalf, so
    // whoever is set here is root from the very first block and is responsible for configuring delays, granters,
    // revokers and permissions afterwards.
    Root: RobinhoodchainAdmin,
    // `nextRoot` is set as the pending root, and may call `claimRoot` at any time without waiting for the root
    // transfer delay. It exists to support handovers (e.g. deployer as `Root`, governance as `NextRoot`); setting it
    // to `Root` leaves the account that is already root as its own pending root, so claiming is a no-op.
    NextRoot: RobinhoodchainAdmin,
    RootTransferDelay,
  },
};
