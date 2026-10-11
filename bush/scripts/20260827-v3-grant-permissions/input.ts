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
const BushContractRegistryTask = new Task('20260923-v3-contract-registry-v2', TaskMode.READ_ONLY, network);
const TokenPairRegistryTask = new Task('20260803-v3-token-pair-registry', TaskMode.READ_ONLY, network);
const ProtocolFeeSweeperTask = new Task('20260827-v3-protocol-fee-sweeper-v2', TaskMode.READ_ONLY, network);
const StablePoolTask = new Task('20260803-v3-stable-pool', TaskMode.READ_ONLY, network);
const WeightedPoolTask = new Task('20261001-v3-weighted-pool', TaskMode.READ_ONLY, network);
const ReClammPoolTask = new Task('20261007-v3-reclamm-pool', TaskMode.READ_ONLY, network);
const LiquidityZapperTask = new Task('20261007-v3-zapper-v3', TaskMode.READ_ONLY, network);

// VaultAdmin and VaultExtension run as delegate calls from the Vault, so `address(this)` - and therefore the `where`
// of every permission they check - is the Vault itself, not the VaultAdmin deployment.
const Vault = VaultTask.output().Vault;
const ProtocolFeeController = ProtocolFeeControllerTask.output().ProtocolFeeController;
const BushContractRegistry = BushContractRegistryTask.output().BushContractRegistry;
const TokenPairRegistry = TokenPairRegistryTask.output().TokenPairRegistry;
const ProtocolFeeSweeper = ProtocolFeeSweeperTask.output().ProtocolFeeSweeper;
const StablePoolFactory = StablePoolTask.output().StablePoolFactory;
const WeightedPoolFactory = WeightedPoolTask.output().WeightedPoolFactory;
const ReClammPoolFactory = ReClammPoolTask.output().ReClammPoolFactory;
const LiquidityZapper = LiquidityZapperTask.output().MultiRouterLiquidityZapper;

// The admin Safe: holds every permission below except where noted, and becomes root of the TimelockAuthorizer once
// `20261001-v3-root-change` has been claimed. Until then root is the admin EOA, which sends these grants.
const Admin = '0xEF39548241ABb0B8B072BD2C0ce25BB5A326009F';

// The admin EOA: root until the Safe claims it, and the account that sends these grants.
const AdminEOA = '0xAfb63FBd653A55f180a84076673f4abF9E68232c';

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

  // Sweeper configuration. These are `onlyFeeRecipientOrGovernance`: the sweeper's `feeRecipient` (the separate 2-of-3
  // Safe 0x572ffb4AA774aB785E2eC79CEC4071BB3037575a) can always call them, and these grants let the admin do so too.
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

  // The admin EOA can sweep, so routine sweeps don't need a Safe transaction. It gets nothing else on the sweeper:
  // configuration (fee recipient, target token, burners) stays with the Safe.
  ...grant(
    ProtocolFeeSweeperTask,
    'ProtocolFeeSweeper',
    [
      'sweepProtocolFeesForToken(address,address,uint256,uint256,address)',
      'sweepProtocolFeesForWrappedToken(address,address,uint256,uint256,address)',
    ],
    AdminEOA,
    ProtocolFeeSweeper,
    'AdminEOA'
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
      'registerPoolFactory(string,address,string,uint8,address)',
    ],
    Admin,
    BushContractRegistry,
    'Admin'
  ),

  // Liquidity zapper. `zap` is permissionless; only the swap router allowlist and token rescue are gated.
  ...grant(
    LiquidityZapperTask,
    'MultiRouterLiquidityZapper',
    ['setSwapRouterAllowed(address,bool)', 'rescue(address,address,uint256)'],
    Admin,
    LiquidityZapper,
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
  ...grant(ReClammPoolTask, 'ReClammPoolFactory', ['disable()'], Admin, ReClammPoolFactory, 'Admin'),

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

  // ReClamm pool parameters follow the same pattern: `onlySwapFeeManagerOrGovernance(address(this))` on the pool, with
  // action IDs disambiguated by the factory, so a single global grant covers every pool from this factory.
  ...grant(
    ReClammPoolTask,
    'ReClammPool',
    [
      'setCenterednessMargin(uint256)',
      'setDailyPriceShiftExponent(uint256)',
      'startPriceRatioUpdate(uint256,uint256,uint256)',
      'stopPriceRatioUpdate()',
    ],
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
