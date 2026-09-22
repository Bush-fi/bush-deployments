import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { bn, fp } from '@helpers/numbers';
import { ZERO_ADDRESS } from '@helpers/constants';
import { currentTimestamp, DAY } from '@helpers/time';
import {
  BushContracts,
  createStablePool,
  initializePool,
  loadBushContracts,
  standardTokenConfig,
  TokenConfig,
} from '@helpers/bushFork';
import { StablePoolDeployment } from '../input';

describeForkTest('V3-StablePool', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260803-v3-stable-pool';
  const POOL_CONTRACT_NAME = 'StablePool';
  const FACTORY_CONTRACT_NAME = POOL_CONTRACT_NAME + 'Factory';
  const VERSION = 1;
  const AMP = 1000n;
  const LARGE_AMP = 6000;

  let task: Task;
  let input: StablePoolDeployment;
  let contracts: BushContracts;
  let factory: Contract, pool: Contract;
  let tokenConfig: TokenConfig[];
  let admin: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as StablePoolDeployment;
    factory = await task.deployedInstance(FACTORY_CONTRACT_NAME);
    contracts = await loadBushContracts();

    tokenConfig = standardTokenConfig([input.WETH, input.SimpleTestToken]);
    admin = await getSigner(0);
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
    const mockPool = new Task(TASK_NAME, TaskMode.READ_ONLY, getForkedNetwork(hre)).output().MockStablePool;

    expect(await contracts.stablePoolFactory.isPoolFromFactory(mockPool)).to.be.true;
    expect(await contracts.vaultAsExtension.isPoolRegistered(mockPool)).to.be.true;
    expect(await contracts.vaultAsExtension.isPoolInitialized(mockPool)).to.be.false;
  });

  it('deploys pool', async () => {
    const poolAddress = await createStablePool(factory, tokenConfig, AMP, {
      roleAccounts: { pauseManager: ZERO_ADDRESS, swapFeeManager: admin.address, poolCreator: ZERO_ADDRESS },
    });
    pool = await task.instanceAt(POOL_CONTRACT_NAME, poolAddress);

    expect(await factory.isPoolFromFactory(poolAddress)).to.be.true;
  });

  it('checks pool tokens', async () => {
    const poolTokens = (await pool.getTokens()).map((token: string) => token.toLowerCase());
    expect(poolTokens).to.be.deep.eq(tokenConfig.map((config) => config.token.toLowerCase()));
  });

  it('checks pool version', async () => {
    const version = JSON.parse(await pool.version());
    expect(version.deployment).to.be.eq(TASK_NAME);
    expect(version.version).to.be.eq(VERSION);
    expect(version.name).to.be.eq(POOL_CONTRACT_NAME);
  });

  it('checks amplification parameter', async () => {
    const { value, isUpdating, precision } = await pool.getAmplificationParameter();
    expect(value).to.be.eq(AMP * precision);
    expect(isUpdating).to.be.false;
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

  it('swap fee manager can set amp factor above 5k', async () => {
    const endTime = (await currentTimestamp()) + bn(4 * DAY);

    await (pool.connect(admin) as Contract).startAmplificationParameterUpdate(LARGE_AMP, endTime);

    const { isUpdating } = await pool.getAmplificationParameter();
    expect(isUpdating).to.be.true;
  });
});
