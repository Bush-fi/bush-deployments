import { Task, TaskMode } from '@src';

export type PermissionData = {
  // The action being granted, identified by the contract that checks it.
  actionId: string;
  // The account that will be allowed to perform the action.
  account: string;
  // The contract the action is granted on, or `EVERYWHERE` for every target.
  where: string;
  // Human readable description, only used for logging.
  description: string;
};

export type GrantPermissionsDeployment = {
  Permissions: PermissionData[];
};

const network = 'robinhoodchain';

// `TimelockAuthorizer.EVERYWHERE()`: a wildcard for the `where` slot, granting the action on every target rather than
// on a single contract. Note that a global grant must be revoked globally before any specific ones can be addressed.
const EVERYWHERE = '0xffffffffffffffffffffffffffffffffffffffff';

const VaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, network);
const ProtocolFeeControllerTask = new Task('20260730-v3-protocol-fee-controller', TaskMode.READ_ONLY, network);
const BushContractRegistryTask = new Task('20260802-v3-contract-registry', TaskMode.READ_ONLY, network);
const TokenPairRegistryTask = new Task('20260803-v3-token-pair-registry', TaskMode.READ_ONLY, network);
const ProtocolFeeSweeperTask = new Task('20260827-v3-protocol-fee-sweeper-v2', TaskMode.READ_ONLY, network);
const StablePoolTask = new Task('20260803-v3-stable-pool', TaskMode.READ_ONLY, network);
const WeightedPoolTask = new Task('20260803-v3-weighted-pool', TaskMode.READ_ONLY, network);

// VaultAdmin and VaultExtension run as delegate calls from the Vault, so `address(this)` - and therefore the `where`
// of every permission they check - is the Vault itself, not the VaultAdmin deployment.
const Vault = VaultTask.output().Vault;
const ProtocolFeeController = ProtocolFeeControllerTask.output().ProtocolFeeController;
const BushContractRegistry = BushContractRegistryTask.output().BushContractRegistry;
const TokenPairRegistry = TokenPairRegistryTask.output().TokenPairRegistry;
const ProtocolFeeSweeper = ProtocolFeeSweeperTask.output().ProtocolFeeSweeper;
const StablePoolFactory = StablePoolTask.output().StablePoolFactory;
const WeightedPoolFactory = WeightedPoolTask.output().WeightedPoolFactory;

// Root of the TimelockAuthorizer, and the fee recipient of the ProtocolFeeSweeper.
const Admin = '0xAfb63FBd653A55f180a84076673f4abF9E68232c';

function grant(
  task: Task,
  contract: string,
  signatures: string[],
  account: string,
  where: string,
  accountLabel: string
): PermissionData[] {
  return signatures.map((signature) => ({
    actionId: task.actionId(contract, signature),
    account,
    where,
    description: `${accountLabel} -> ${contract}.${signature}`,
  }));
}

const Permissions: PermissionData[] = [
  // Vault-wide actions. These use the `authenticate` modifier, which checks `where == address(this)`, i.e. the Vault.
  ...grant(
    VaultTask,
    'VaultAdmin',
    [
      'pauseVault()',
      'unpauseVault()',
      'pauseVaultBuffers()',
      'unpauseVaultBuffers()',
      'enableQuery()',
      'disableQuery()',
      'disableQueryPermanently()',
      'enableRecoveryMode(address)',
      'disableRecoveryMode(address)',
      'setProtocolFeeController(address)',
      'setAuthorizer(address)',
    ],
    Admin,
    Vault,
    'Admin'
  ),

  // Pool-scoped actions. These check `where == pool` (deferring to governance when the pool has no pause manager or
  // swap fee manager), so they are granted on EVERYWHERE to cover pools that do not exist yet.
  ...grant(
    VaultTask,
    'VaultAdmin',
    ['pausePool(address)', 'unpausePool(address)', 'setStaticSwapFeePercentage(address,uint256)'],
    Admin,
    EVERYWHERE,
    'Admin'
  ),

  // Protocol fees.
  ...grant(
    ProtocolFeeControllerTask,
    'ProtocolFeeController',
    [
      'setGlobalProtocolSwapFeePercentage(uint256)',
      'setGlobalProtocolYieldFeePercentage(uint256)',
      'setProtocolSwapFeePercentage(address,uint256)',
      'setProtocolYieldFeePercentage(address,uint256)',
      'withdrawProtocolFees(address,address)',
      'withdrawProtocolFeesForToken(address,address,address)',
    ],
    Admin,
    ProtocolFeeController,
    'Admin'
  ),

  // The sweeper withdraws a single fee token to itself before handing it to a burner, so it needs the per-token
  // variant on the fee controller. Without this, every sweep reverts.
  ...grant(
    ProtocolFeeControllerTask,
    'ProtocolFeeController',
    ['withdrawProtocolFeesForToken(address,address,address)'],
    ProtocolFeeSweeper,
    ProtocolFeeController,
    'ProtocolFeeSweeper'
  ),

  // Sweeper configuration. The admin is already the sweeper's `feeRecipient`, which short-circuits these checks, but
  // granting them explicitly keeps the admin in control if the fee recipient is ever changed.
  ...grant(
    ProtocolFeeSweeperTask,
    'ProtocolFeeSweeper',
    [
      'sweepProtocolFeesForToken(address,address,uint256,uint256,address)',
      'sweepProtocolFeesForWrappedToken(address,address,uint256,uint256,address)',
      'setFeeRecipient(address)',
      'setTargetToken(address)',
      'addProtocolFeeBurner(address)',
      'removeProtocolFeeBurner(address)',
    ],
    Admin,
    ProtocolFeeSweeper,
    'Admin'
  ),

  // Contract registry.
  ...grant(
    BushContractRegistryTask,
    'BushContractRegistry',
    [
      'registerBushContract(uint8,string,address)',
      'deregisterBushContract(string)',
      'deprecateBushContract(address)',
      'addOrUpdateBushContractAlias(string,address)',
    ],
    Admin,
    BushContractRegistry,
    'Admin'
  ),

  // Token pair registry.
  ...grant(
    TokenPairRegistryTask,
    'TokenPairRegistry',
    [
      'addPath(address,(address,address,bool)[])',
      'addSimplePath(address)',
      'removePathAtIndex(address,address,uint256)',
      'removeSimplePath(address)',
    ],
    Admin,
    TokenPairRegistry,
    'Admin'
  ),

  // Pool factories. `create` is permissionless; only `disable` is governance-gated.
  ...grant(StablePoolTask, 'StablePoolFactory', ['disable()'], Admin, StablePoolFactory, 'Admin'),
  ...grant(WeightedPoolTask, 'WeightedPoolFactory', ['disable()'], Admin, WeightedPoolFactory, 'Admin'),

  // Amplification updates live on the pool, not the factory, and check `onlySwapFeeManagerOrGovernance(address(this))`
  // - deferring to governance only when the pool has no swap fee manager - so they are granted on EVERYWHERE to cover
  // pools that do not exist yet. The action IDs are disambiguated by the factory address rather than the pool address
  // (see `BasePoolAuthentication`), so a single grant covers every pool from this factory.
  ...grant(
    StablePoolTask,
    'StablePool',
    ['startAmplificationParameterUpdate(uint256,uint256)', 'stopAmplificationParameterUpdate()'],
    Admin,
    EVERYWHERE,
    'Admin'
  ),
];

export default {
  robinhoodchain: {
    Permissions,
  },
};
