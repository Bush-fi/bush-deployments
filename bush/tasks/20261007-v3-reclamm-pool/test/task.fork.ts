import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { ZERO_ADDRESS } from '@helpers/constants';
import * as expectEvent from '@helpers/expectEvent';
import { fp } from '@helpers/numbers';
import { BushContracts, initializePool, loadBushContracts, standardTokenConfig, TokenConfig } from '@helpers/bushFork';
import { ReClammPoolDeployment } from '../input';

// ReClammPool is above the EIP-170 24KB limit. Robinhood Chain accepts it, but the local fork enforces the limit by
// default. This must be set before the fork's provider is created.
(hre.network.config as { allowUnlimitedContractSize?: boolean }).allowUnlimitedContractSize = true;

describeForkTest('V3-ReClammPool', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20261007-v3-reclamm-pool';
  const POOL_CONTRACT_NAME = 'ReClammPool';
  const FACTORY_CONTRACT_NAME = POOL_CONTRACT_NAME + 'Factory';
  const VERSION = 1;

  let task: Task;
  let input: ReClammPoolDeployment;
  let contracts: BushContracts;
  let factory: Contract, helper: Contract, pool: Contract;
  let tokenConfig: TokenConfig[];

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as ReClammPoolDeployment;
    factory = await task.deployedInstance(FACTORY_CONTRACT_NAME);
    helper = await task.deployedInstance('ReClammPoolHelper');
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
    expect(await factory.reClammPoolHelper()).to.be.eq(helper.target);
    expect(await factory.isDisabled()).to.be.false;
  });

  it('checks helper configuration', async () => {
    expect(await helper.vault()).to.be.eq(input.Vault);
  });

  it('deploys pool', async () => {
    const receipt = await (
      await factory.create(
        'Test ReClamm Pool',
        'TRP',
        tokenConfig,
        { pauseManager: ZERO_ADDRESS, swapFeeManager: ZERO_ADDRESS, poolCreator: ZERO_ADDRESS },
        fp(0.01),
        {
          initialMinPrice: fp(0.5),
          initialMaxPrice: fp(2),
          initialTargetPrice: fp(1),
          tokenAPriceIncludesRate: false,
          tokenBPriceIncludesRate: false,
        },
        fp(0.1),
        fp(0.2),
        '0x' + '11'.repeat(32)
      )
    ).wait();
    const poolAddress = expectEvent.inReceipt(receipt, 'PoolCreated').args.pool;
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

  it('initializes the pool', async () => {
    const lp = await getSigner(1);
    const tokens = tokenConfig.map((config) => config.token);
    // ReClamm pools must be initialized at the exact balance ratio implied by their price parameters.
    const amounts = await helper.computeInitialBalancesRaw(pool.target, tokens[0], fp(100));

    await initializePool(contracts, lp, pool.target.toString(), tokens, [...amounts]);

    expect(await contracts.vaultAsExtension.isPoolInitialized(pool.target.toString())).to.be.true;
    expect(await pool.balanceOf(lp.address)).to.be.gt(0);
    expect(await pool.isPoolWithinTargetRange()).to.be.true;
  });
});
