import { Task, TaskMode } from '@src';

export type ProtocolFeeSweeperDeployment = {
  Vault: string;
  FeeRecipient: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
// See https://github.com/balancer/bal_addresses/blob/cc26cd8c1d7c3c48c09f4d5d35704a0bbf00dd48/extras/multisigs.json#L10
const MaxiOmniMultisig = '0x9ff471F9f98F42E5151C7855fD1b5aa906b1AF7e';
const SepoliaAdmin = '0x9098b50ee2d9E4c3C69928A691DA3b192b4C9673';

export default {
  Vault,
  arbitrum: {
    FeeRecipient: MaxiOmniMultisig,
  },
  base: {
    FeeRecipient: MaxiOmniMultisig,
  },
  avalanche: {
    FeeRecipient: MaxiOmniMultisig,
  },
  optimism: {
    FeeRecipient: MaxiOmniMultisig,
  },
  gnosis: {
    FeeRecipient: MaxiOmniMultisig,
  },
  mainnet: {
    FeeRecipient: MaxiOmniMultisig,
  },
  hyperevm: {
    FeeRecipient: MaxiOmniMultisig,
  },
  plasma: {
    FeeRecipient: MaxiOmniMultisig,
  },
  xlayer: {
    FeeRecipient: MaxiOmniMultisig,
  },
  monad: {
    FeeRecipient: MaxiOmniMultisig,
  },
  sepolia: {
    FeeRecipient: SepoliaAdmin,
  },
  // TODO: replace with the real fee-recipient EOA or multisig for this chain before deploying.
  robinhoodchain: {
    FeeRecipient: '0xAfb63FBd653A55f180a84076673f4abF9E68232c',
  },
};
