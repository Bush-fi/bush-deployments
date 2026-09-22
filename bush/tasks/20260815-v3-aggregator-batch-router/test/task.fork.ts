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
import { AggregatorBatchRouterDeployment } from '../input';

describeForkTest('V3-AggregatorBatchRouter', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260815-v3-aggregator-batch-router';
  const CONTRACT_NAME = 'AggregatorBatchRouter';
  const VERSION = 1;

  let task: Task;
  let input: AggregatorBatchRouterDeployment;
  let contracts: BushContracts;
  let aggregatorBatchRouter: Contract, pool: Contract;
  let alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as AggregatorBatchRouterDeployment;
    aggregatorBatchRouter = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    alice = await getSigner();
  });

  before('create and seed pool', async () => {
    pool = await createInitializedWeightedPool(contracts, await getSigner(1));
  });

  it('checks router version', async () => {
    const routerVersion = JSON.parse(await aggregatorBatchRouter.version());
    expect(routerVersion.name).to.be.eq(CONTRACT_NAME);
    expect(routerVersion.version).to.be.eq(VERSION);
    expect(routerVersion.deployment).to.be.eq(TASK_NAME);
  });

  it('checks vault', async () => {
    expect(await aggregatorBatchRouter.getVault()).to.eq(input.Vault);
  });

  it('performs swap', async () => {
    const TEST = contracts.testToken.target.toString();
    const WETH = contracts.weth.target.toString();
    const amountIn = fp(10);

    await mintTestToken(contracts.testToken, alice.address, amountIn);

    const pathsExactIn = [
      {
        tokenIn: TEST,
        steps: [{ pool: pool.target.toString(), tokenOut: WETH, isBuffer: false }],
        exactAmountIn: amountIn,
        minAmountOut: 0,
      },
    ];

    const querySigner = await getQuerySigner();
    const queryResult = await (aggregatorBatchRouter.connect(querySigner) as Contract).querySwapExactIn.staticCall(
      pathsExactIn,
      alice.address,
      '0x'
    );

    expect(queryResult.tokensOut[0]).to.equal(WETH);
    expect(queryResult.pathAmountsOut[0]).to.eq(queryResult.amountsOut[0]);
    expect(queryResult.amountsOut[0]).to.be.gt(0);

    const wethBefore = await contracts.weth.balanceOf(alice.address);

    // Aggregator routers don't pull tokens: the token in is paid to the Vault upfront.
    await (contracts.testToken.connect(alice) as Contract).transfer(contracts.vault.target.toString(), amountIn);
    await (aggregatorBatchRouter.connect(alice) as Contract).swapExactIn(pathsExactIn, ethers.MaxUint256, '0x');

    expect((await contracts.weth.balanceOf(alice.address)) - wethBefore).to.be.eq(queryResult.amountsOut[0]);
  });
});
