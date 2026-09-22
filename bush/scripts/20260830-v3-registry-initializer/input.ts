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
  // 'StablePoolFactory'), again matching upstream: they answer "what is the current stable pool factory?".
  register('20260803-v3-weighted-pool', 'WeightedPoolFactory', ContractType.POOL_FACTORY, 'WeightedPool'),
  register('20260803-v3-stable-pool', 'StablePoolFactory', ContractType.POOL_FACTORY, 'StablePool'),
];

export default {
  robinhoodchain: {
    Registrations,
  },
};
