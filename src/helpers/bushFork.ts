import hre, { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';

import { getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import * as expectEvent from '@helpers/expectEvent';
import { MAX_UINT48, ONES_BYTES32, ZERO_ADDRESS, ZERO_BYTES32 } from '@helpers/constants';
import { fp } from '@helpers/numbers';

/**
 * Shared setup for fork tests against the Bush deployment on Robinhood Chain.
 *
 * There are no third-party pools or token whales on the chain to lean on, so tests build what they need: WETH is
 * minted by wrapping native balance (`hardhat_setBalance` + `deposit`), TEST is taken from the deployer, and pools
 * are created and seeded through the live factories and router.
 */

// Deployer of every Bush contract: owner of the `BootstrapAuthorizer` the Vault points at, root of the
// `TimelockAuthorizer`, and holder of (nearly) the whole `SimpleTestToken` supply.
export const BUSH_ADMIN = '0xAfb63FBd653A55f180a84076673f4abF9E68232c';

export const TOKEN_TYPE_STANDARD = 0;

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function transfer(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

const WETH_ABI = [...ERC20_ABI, 'function deposit() payable', 'function withdraw(uint256)'];

const PERMIT2_ABI = ['function approve(address token, address spender, uint160 amount, uint48 expiration)'];

export type TokenConfig = { token: string; tokenType: number; rateProvider: string; paysYieldFees: boolean };

export type BushContracts = {
  vault: Contract;
  vaultAsAdmin: Contract;
  vaultAsExtension: Contract;
  router: Contract;
  permit2: Contract;
  weth: Contract;
  testToken: Contract;
  weightedPoolFactory: Contract;
  stablePoolFactory: Contract;
};

/**
 * Instances of the live Bush deployment, read from the tasks' outputs for the forked network.
 */
export async function loadBushContracts(): Promise<BushContracts> {
  const network = getForkedNetwork(hre);

  const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, network);
  const vault = await vaultTask.deployedInstance('Vault');
  const vaultAddress = vault.target.toString();

  // VaultAdmin and VaultExtension functions are called through the Vault, which delegates to them.
  const vaultAsAdmin = (await vaultTask.deployedInstance('VaultAdmin')).attach(vaultAddress) as Contract;
  const vaultAsExtension = (await vaultTask.deployedInstance('VaultExtension')).attach(vaultAddress) as Contract;

  const router = await new Task('20260801-v3-router', TaskMode.READ_ONLY, network).deployedInstance('Router');

  const permit2Address = new Task('00000000-permit2', TaskMode.READ_ONLY, network).output().Permit2;
  const wethAddress = new Task('000000001-tokens', TaskMode.READ_ONLY, network).output().WETH;
  const testTokenAddress = new Task('20260803-v3-test-token', TaskMode.READ_ONLY, network).output().SimpleTestToken;

  const weightedPoolFactory = await new Task('20260803-v3-weighted-pool', TaskMode.READ_ONLY, network).deployedInstance(
    'WeightedPoolFactory'
  );
  const stablePoolFactory = await new Task('20260803-v3-stable-pool', TaskMode.READ_ONLY, network).deployedInstance(
    'StablePoolFactory'
  );

  return {
    vault,
    vaultAsAdmin,
    vaultAsExtension,
    router,
    permit2: new Contract(permit2Address, PERMIT2_ABI, ethers.provider),
    weth: new Contract(wethAddress, WETH_ABI, ethers.provider),
    testToken: new Contract(testTokenAddress, ERC20_ABI, ethers.provider),
    weightedPoolFactory,
    stablePoolFactory,
  };
}

/**
 * Signer for Vault queries. The Vault treats a call as a query only when `tx.origin` is the zero address (that is
 * how it detects an `eth_call`), so `query*` functions must be static-called from an impersonated zero address.
 */
export async function getQuerySigner(): Promise<SignerWithAddress> {
  return impersonate(ZERO_ADDRESS, fp(1));
}

/**
 * Impersonates the Bush admin with plenty of native balance to pay for gas.
 */
export async function getBushAdmin(): Promise<SignerWithAddress> {
  return impersonate(BUSH_ADMIN, fp(1000));
}

/**
 * Gives `recipient` `amount` WETH by wrapping native balance, leaving them with `nativeBalance` native on top.
 */
export async function mintWeth(
  weth: Contract,
  recipient: SignerWithAddress,
  amount: bigint,
  nativeBalance = fp(1000)
): Promise<void> {
  await setBalance(recipient.address, amount + nativeBalance);
  await (weth.connect(recipient) as Contract).deposit({ value: amount });
}

/**
 * Gives `recipient` `amount` TEST, transferred from the deployer.
 */
export async function mintTestToken(testToken: Contract, recipient: string, amount: bigint): Promise<void> {
  const admin = await getBushAdmin();
  await (testToken.connect(admin) as Contract).transfer(recipient, amount);
}

/**
 * Sets the two-step approval the routers pull tokens with: token -> Permit2, then Permit2 -> spender.
 */
export async function approveViaPermit2(
  token: Contract,
  permit2: Contract,
  owner: SignerWithAddress,
  spender: string,
  amount: bigint
): Promise<void> {
  await (token.connect(owner) as Contract).approve(permit2.target.toString(), amount);
  await (permit2.connect(owner) as Contract).approve(token.target.toString(), spender, amount, MAX_UINT48);
}

/**
 * A standard (no rate provider) token config for `tokens`, sorted by address as the Vault requires.
 */
export function standardTokenConfig(tokens: string[]): TokenConfig[] {
  return tokens
    .map((token) => ({ token, tokenType: TOKEN_TYPE_STANDARD, rateProvider: ZERO_ADDRESS, paysYieldFees: false }))
    .sort((a, b) => a.token.toLowerCase().localeCompare(b.token.toLowerCase()));
}

const DEFAULT_ROLE_ACCOUNTS = { pauseManager: ZERO_ADDRESS, swapFeeManager: ZERO_ADDRESS, poolCreator: ZERO_ADDRESS };

export type PoolOptions = {
  name?: string;
  symbol?: string;
  swapFeePercentage?: bigint;
  roleAccounts?: { pauseManager: string; swapFeeManager: string; poolCreator: string };
  salt?: string;
};

/**
 * Creates a weighted pool through `factory` and returns its address. Weights default to 50/50 for two tokens.
 */
export async function createWeightedPool(
  factory: Contract,
  tokenConfig: TokenConfig[],
  weights: bigint[] = tokenConfig.map(() => fp(1 / tokenConfig.length)),
  options: PoolOptions = {}
): Promise<string> {
  const receipt = await (
    await factory.create(
      options.name ?? 'Test Weighted Pool',
      options.symbol ?? 'TWP',
      tokenConfig,
      weights,
      options.roleAccounts ?? DEFAULT_ROLE_ACCOUNTS,
      options.swapFeePercentage ?? fp(0.01),
      ZERO_ADDRESS, // hooks
      false, // enable donations
      false, // disable unbalanced liquidity
      options.salt ?? ONES_BYTES32
    )
  ).wait();

  return expectEvent.inReceipt(receipt, 'PoolCreated').args.pool;
}

/**
 * Creates a stable pool through `factory` and returns its address.
 */
export async function createStablePool(
  factory: Contract,
  tokenConfig: TokenConfig[],
  amplificationParameter = 200n,
  options: PoolOptions = {}
): Promise<string> {
  const receipt = await (
    await factory.create(
      options.name ?? 'Test Stable Pool',
      options.symbol ?? 'TSP',
      tokenConfig,
      amplificationParameter,
      options.roleAccounts ?? DEFAULT_ROLE_ACCOUNTS,
      options.swapFeePercentage ?? fp(0.01),
      ZERO_ADDRESS, // hooks
      false, // enable donations
      false, // disable unbalanced liquidity
      options.salt ?? ONES_BYTES32
    )
  ).wait();

  return expectEvent.inReceipt(receipt, 'PoolCreated').args.pool;
}

/**
 * Funds `lp` with `amounts` of `tokens` (which must be WETH or TEST) and initializes `pool` with them through
 * `router`. Tokens are approved through Permit2 and pulled as ERC20s, so `tokens` can be in any order.
 */
export async function initializePool(
  contracts: BushContracts,
  lp: SignerWithAddress,
  pool: string,
  tokens: string[],
  amounts: bigint[]
): Promise<void> {
  for (const [i, token] of tokens.entries()) {
    const tokenContract = await fundToken(contracts, lp, token, amounts[i]);
    await approveViaPermit2(tokenContract, contracts.permit2, lp, contracts.router.target.toString(), amounts[i]);
  }

  await (contracts.router.connect(lp) as Contract).initialize(pool, tokens, amounts, 0, false, ZERO_BYTES32);
}

/**
 * Gives `recipient` `amount` of `token`, which must be either WETH or TEST, and returns the token instance.
 */
export async function fundToken(
  contracts: BushContracts,
  recipient: SignerWithAddress,
  token: string,
  amount: bigint
): Promise<Contract> {
  if (token.toLowerCase() === contracts.weth.target.toString().toLowerCase()) {
    await mintWeth(contracts.weth, recipient, amount);
    return contracts.weth;
  } else if (token.toLowerCase() === contracts.testToken.target.toString().toLowerCase()) {
    await mintTestToken(contracts.testToken, recipient.address, amount);
    return contracts.testToken;
  }

  throw Error(`Cannot fund ${token}: only WETH and TEST are available on the fork`);
}

/**
 * Creates and seeds a 50/50 WETH/TEST weighted pool with `amount` of each token, provided by `lp`.
 */
export async function createInitializedWeightedPool(
  contracts: BushContracts,
  lp: SignerWithAddress,
  amount = fp(1000),
  options: PoolOptions = {}
): Promise<Contract> {
  const tokens = [contracts.weth.target.toString(), contracts.testToken.target.toString()];
  const tokenConfig = standardTokenConfig(tokens);

  const poolAddress = await createWeightedPool(contracts.weightedPoolFactory, tokenConfig, undefined, options);
  await initializePool(
    contracts,
    lp,
    poolAddress,
    tokenConfig.map((config) => config.token),
    tokenConfig.map(() => amount)
  );

  const poolTask = new Task('20260803-v3-weighted-pool', TaskMode.READ_ONLY, getForkedNetwork(hre));
  return poolTask.instanceAt('WeightedPool', poolAddress);
}

/**
 * Deploys a 1:1 ERC4626 wrapper over `asset` and, if `initialUnderlying` is set, initializes its Vault buffer
 * through the live buffer router with that much underlying, provided by `lp`.
 */
export async function deployWrappedToken(
  contracts: BushContracts,
  asset: Contract,
  lp: SignerWithAddress,
  initialUnderlying?: bigint
): Promise<Contract> {
  const symbol = 'w' + (await asset.symbol());
  const wrapped = await ethers.deployContract('MockERC4626', [asset.target.toString(), 'Wrapped ' + symbol, symbol]);
  await wrapped.waitForDeployment();

  if (initialUnderlying !== undefined) {
    const bufferRouter = await new Task(
      '20260801-v3-buffer-router',
      TaskMode.READ_ONLY,
      getForkedNetwork(hre)
    ).deployedInstance('BufferRouter');

    await fundToken(contracts, lp, asset.target.toString(), initialUnderlying);
    await approveViaPermit2(asset, contracts.permit2, lp, bufferRouter.target.toString(), initialUnderlying);
    await (bufferRouter.connect(lp) as Contract).initializeBuffer(wrapped.target.toString(), initialUnderlying, 0, 0);
  }

  return wrapped;
}
