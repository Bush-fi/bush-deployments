import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import {
  BushContracts,
  createInitializedWeightedPool,
  getQuerySigner,
  loadBushContracts,
  mintTestToken,
} from '@helpers/bushFork';
import { AggregatorRouterDeployment } from '../input';

describeForkTest('V3-AggregatorRouter', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260815-v3-aggregator-router';
  const CONTRACT_NAME = 'AggregatorRouter';
  const VERSION = 1;

  let task: Task;
  let input: AggregatorRouterDeployment;
  let contracts: BushContracts;
  let aggregatorRouter: Contract, pool: Contract;
  let alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as AggregatorRouterDeployment;
    aggregatorRouter = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    alice = await getSigner();
  });

  before('create and seed pool', async () => {
    pool = await createInitializedWeightedPool(contracts, await getSigner(1));
  });

  it('checks router version', async () => {
    const routerVersion = JSON.parse(await aggregatorRouter.version());
    expect(routerVersion.name).to.be.eq(CONTRACT_NAME);
    expect(routerVersion.version).to.be.eq(VERSION);
    expect(routerVersion.deployment).to.be.eq(TASK_NAME);
  });

  it('checks vault', async () => {
    expect(await aggregatorRouter.getVault()).to.eq(input.Vault);
  });

  it('performs swap', async () => {
    const TEST = contracts.testToken.target.toString();
    const WETH = contracts.weth.target.toString();
    const amountIn = fp(10);

    await mintTestToken(contracts.testToken, alice.address, amountIn);

    const querySigner = await getQuerySigner();
    const expectedAmountOut = await (
      aggregatorRouter.connect(querySigner) as Contract
    ).querySwapSingleTokenExactIn.staticCall(pool.target.toString(), TEST, WETH, amountIn, alice.address, '0x');
    expect(expectedAmountOut).to.be.gt(0);

    const wethBefore = await contracts.weth.balanceOf(alice.address);

    // Aggregator routers don't pull tokens: the token in is paid to the Vault upfront.
    await (contracts.testToken.connect(alice) as Contract).transfer(await aggregatorRouter.getVault(), amountIn);
    await (aggregatorRouter.connect(alice) as Contract).swapSingleTokenExactIn(
      pool.target.toString(),
      TEST,
      WETH,
      amountIn,
      expectedAmountOut,
      ethers.MaxUint256, // deadline
      '0x'
    );

    expect((await contracts.weth.balanceOf(alice.address)) - wethBefore).to.be.eq(expectedAmountOut);
  });
});
