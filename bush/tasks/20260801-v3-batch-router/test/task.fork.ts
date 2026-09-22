import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import {
  approveViaPermit2,
  BushContracts,
  createInitializedWeightedPool,
  getQuerySigner,
  loadBushContracts,
  mintTestToken,
} from '@helpers/bushFork';
import { BatchRouterDeployment } from '../input';

describeForkTest('V3-BatchRouter', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260801-v3-batch-router';
  const CONTRACT_NAME = 'BatchRouter';
  const VERSION = 1;

  let task: Task;
  let input: BatchRouterDeployment;
  let contracts: BushContracts;
  let batchRouter: Contract, pool: Contract;
  let wethSigner: SignerWithAddress, alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as BatchRouterDeployment;
    batchRouter = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    wethSigner = await impersonate(input.WETH, fp(100));
    alice = await getSigner();
  });

  before('create and seed pool', async () => {
    pool = await createInitializedWeightedPool(contracts, await getSigner(1));
  });

  it('checks batch router version', async () => {
    const batchRouterVersion = JSON.parse(await batchRouter.version());
    expect(batchRouterVersion.name).to.be.eq(CONTRACT_NAME);
    expect(batchRouterVersion.version).to.be.eq(VERSION);
    expect(batchRouterVersion.deployment).to.be.eq(TASK_NAME);
  });

  it('checks getters', async () => {
    expect(await batchRouter.getVault()).to.eq(input.Vault);
    expect(await batchRouter.getPermit2()).to.eq(input.Permit2);
    expect(await batchRouter.getWeth()).to.eq(input.WETH);
  });

  it('only accepts ETH from WETH', async () => {
    await expect(wethSigner.sendTransaction({ to: batchRouter.target.toString(), value: ethers.parseEther('1.0') })).to
      .not.be.reverted;

    await expect(alice.sendTransaction({ to: batchRouter.target.toString(), value: ethers.parseEther('1.0') })).to.be
      .reverted;
  });

  it('performs a batch swap', async () => {
    const TEST = contracts.testToken.target.toString();
    const amountIn = fp(10);

    await mintTestToken(contracts.testToken, alice.address, amountIn);
    await approveViaPermit2(contracts.testToken, contracts.permit2, alice, batchRouter.target.toString(), amountIn);

    const paths = [
      {
        tokenIn: TEST,
        steps: [{ pool: pool.target.toString(), tokenOut: input.WETH, isBuffer: false }],
        exactAmountIn: amountIn,
        minAmountOut: 0,
      },
    ];

    const querySigner = await getQuerySigner();
    const query = await (batchRouter.connect(querySigner) as Contract).querySwapExactIn.staticCall(
      paths,
      alice.address,
      '0x'
    );

    expect(query.tokensOut[0]).to.equal(input.WETH);
    expect(query.pathAmountsOut[0]).to.eq(query.amountsOut[0]);
    expect(query.amountsOut[0]).to.be.gt(0);

    const wethBefore = await contracts.weth.balanceOf(alice.address);
    await (batchRouter.connect(alice) as Contract).swapExactIn(paths, ethers.MaxUint256, false, '0x');

    expect((await contracts.weth.balanceOf(alice.address)) - wethBefore).to.be.eq(query.amountsOut[0]);
  });
});
