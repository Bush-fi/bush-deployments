import { Task, TaskMode } from '@src';

// Mirrors the `ContractType` enum in `IBushContractRegistry`. A blank entry has a 0-value type, which is why `OTHER`
// sits at 0: a contract that was never registered reads back as an inactive `OTHER` rather than as a router.
export enum ContractType {
  OTHER = 0,
  POOL_FACTORY = 1,
  ROUTER = 2,
  HOOK = 3,
  ERC4626 = 4,
}

// Mirrors the `HookMode` enum in `IBushContractRegistry`: how the pools a factory deploys get their hook.
export enum HookMode {
  // Pools never have a hook.
  NONE = 0,
  // The pool creator passes a hook (or none) at creation time.
  OPTIONAL = 1,
  // Every pool gets the same hook, which is recorded alongside the factory.
  SPECIFIC = 2,
}

// The extra metadata `registerPoolFactory` records for a pool factory. The registry cannot check it against the
// factory, so it has to be right here.
export type PoolFactoryMetadata = {
  // Free-form and compared exactly (case-sensitive), so stick to upper case: 'WEIGHTED', 'STABLE', etc.
  poolType: string;
  hookMode: HookMode;
  // Required for `SPECIFIC`, and must be left out otherwise.
  hook?: string;
};

export type ContractRegistration = {
  // Only one type per address. A contract that is legitimately several things at once (e.g. a hook that is also a
  // router) is registered under its primary function.
  contractType: ContractType;
  // The registry name, unique across the registry and distinct from every alias. Task IDs are used, matching
  // upstream, so that successive versions of the same contract can coexist.
  name: string;
  address: string;
  // Optional short name resolving to the same address. Aliases are what integrators look up, and are re-pointed at
  // the newest deployment as versions ship, so they are the part of the registry that changes.
  contractAlias?: string;
  // Required for `POOL_FACTORY` entries, which the registry only accepts through `registerPoolFactory`, and must be
  // left out for every other type.
  poolFactory?: PoolFactoryMetadata;
};

export type RegistryInitializerDeployment = {
  Registrations: ContractRegistration[];
};

const network = 'robinhoodchain';

function register(
  taskId: string,
  contract: string,
  contractType: ContractType,
  contractAlias?: string
): ContractRegistration {
  return {
    contractType,
    name: taskId,
    address: new Task(taskId, TaskMode.READ_ONLY, network).output()[contract],
    contractAlias,
  };
}

function registerPoolFactory(
  taskId: string,
  contract: string,
  poolFactory: PoolFactoryMetadata,
  contractAlias?: string
): ContractRegistration {
  return { ...register(taskId, contract, ContractType.POOL_FACTORY, contractAlias), poolFactory };
}

const Registrations: ContractRegistration[] = [
  // Routers. Registering under `ROUTER` is what makes `isTrustedRouter` return true, which is how pools decide
  // whether to believe the sender a router reports, so only genuine routers belong here.
  register('20260801-v3-router', 'Router', ContractType.ROUTER, 'Router'),
  register('20260801-v3-batch-router', 'BatchRouter', ContractType.ROUTER, 'BatchRouter'),
  register(
    '20260801-v3-composite-liquidity-router-v2',
    'CompositeLiquidityRouter',
    ContractType.ROUTER,
    'CompositeLiquidityRouter'
  ),
  register('20260815-v3-aggregator-router', 'AggregatorRouter', ContractType.ROUTER, 'AggregatorRouter'),
  register(
    '20260815-v3-aggregator-batch-router',
    'AggregatorBatchRouter',
    ContractType.ROUTER,
    'AggregatorBatchRouter'
  ),
  register(
    '20260802-v3-unbalanced-add-via-swap-router',
    'UnbalancedAddViaSwapRouter',
    ContractType.ROUTER,
    'UnbalancedAddViaSwapRouter'
  ),
  // The buffer router is registered but deliberately left without an alias, matching upstream: it is called by the
  // Vault's buffer machinery rather than looked up by integrators.
  register('20260801-v3-buffer-router', 'BufferRouter', ContractType.ROUTER),

  // Pool factories. The aliases are the pool type rather than the factory name ('StablePool', not
  // 'StablePoolFactory'), again matching upstream: they answer "what is the current stable pool factory?". Both take
  // a `poolHooksContract` in `create`, so their hook mode is `OPTIONAL`, with no fixed hook.
  registerPoolFactory(
    '20260803-v3-weighted-pool',
    'WeightedPoolFactory',
    { poolType: 'WEIGHTED', hookMode: HookMode.OPTIONAL },
    'WeightedPool'
  ),
  registerPoolFactory(
    '20260803-v3-stable-pool',
    'StablePoolFactory',
    { poolType: 'STABLE', hookMode: HookMode.OPTIONAL },
    'StablePool'
  ),
];

export default {
  robinhoodchain: {
    Registrations,
  },
};
