import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import {
  BushContracts,
  createWeightedPool,
  initializePool,
  loadBushContracts,
  standardTokenConfig,
  TokenConfig,
} from '@helpers/bushFork';
import { WeightedPoolDeployment } from '../input';

describeForkTest('V3-WeightedPool', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260803-v3-weighted-pool';
  const POOL_CONTRACT_NAME = 'WeightedPool';
  const FACTORY_CONTRACT_NAME = POOL_CONTRACT_NAME + 'Factory';
  const VERSION = 2;

  let task: Task;
  let input: WeightedPoolDeployment;
  let contracts: BushContracts;
  let factory: Contract, pool: Contract;
  let tokenConfig: TokenConfig[];

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as WeightedPoolDeployment;
    factory = await task.deployedInstance(FACTORY_CONTRACT_NAME);
    contracts = await loadBushContracts();

    tokenConfig = standardTokenConfig([input.WETH, input.SimpleTestToken]);
  });

  it('checks factory version', async () => {
    const version = JSON.parse(await factory.version());
    expect(version.deployment).to.be.eq(TASK_NAME);
    expect(version.version).to.be.eq(VERSION);
    expect(version.name).to.be.eq(FACTORY_CONTRACT_NAME);
  });

  it('checks factory configuration', async () => {
    expect(await factory.getVault()).to.be.eq(input.Vault);
    expect(await factory.getPauseWindowDuration()).to.be.eq(input.PauseWindowDuration);
    expect(await factory.isDisabled()).to.be.false;
  });

  it('deployed the mock pool on the live network', async () => {
    // The live deployment creates a canary pool from the factory, which must be registered but never initialized.
    // The task only does this in LIVE mode, so this checks the live factory rather than the one deployed here.
    const mockPool = new Task(TASK_NAME, TaskMode.READ_ONLY, getForkedNetwork(hre)).output().MockWeightedPool;

    expect(await contracts.weightedPoolFactory.isPoolFromFactory(mockPool)).to.be.true;
    expect(await contracts.vaultAsExtension.isPoolRegistered(mockPool)).to.be.true;
    expect(await contracts.vaultAsExtension.isPoolInitialized(mockPool)).to.be.false;
  });

  it('deploys pool', async () => {
    const poolAddress = await createWeightedPool(factory, tokenConfig, [fp(0.8), fp(0.2)]);
    pool = await task.instanceAt(POOL_CONTRACT_NAME, poolAddress);

    expect(await factory.isPoolFromFactory(poolAddress)).to.be.true;
  });

  it('checks pool tokens', async () => {
    const poolTokens = (await pool.getTokens()).map((token: string) => token.toLowerCase());
    expect(poolTokens).to.be.deep.eq(tokenConfig.map((config) => config.token.toLowerCase()));
  });

  it('checks pool weights', async () => {
    expect(await pool.getNormalizedWeights()).to.be.deep.eq([fp(0.8), fp(0.2)]);
  });

  it('checks pool version', async () => {
    const version = JSON.parse(await pool.version());
    expect(version.deployment).to.be.eq(TASK_NAME);
    expect(version.version).to.be.eq(VERSION);
    expect(version.name).to.be.eq(POOL_CONTRACT_NAME);
  });

  it('initializes the pool', async () => {
    const lp = await getSigner(1);
    const amounts = tokenConfig.map(() => fp(100));

    await initializePool(
      contracts,
      lp,
      pool.target.toString(),
      tokenConfig.map((config) => config.token),
      amounts
    );

    expect(await contracts.vaultAsExtension.isPoolInitialized(pool.target.toString())).to.be.true;
    expect(await pool.balanceOf(lp.address)).to.be.gt(0);
  });
});
