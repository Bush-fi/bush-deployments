import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import { CompositeLiquidityRouter } from '../input';

describeForkTest('V3-CompositeLiquidityRouter', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260801-v3-composite-liquidity-router-v2';
  const CONTRACT_NAME = 'CompositeLiquidityRouter';
  const VERSION = 2;

  let task: Task;
  let input: CompositeLiquidityRouter;
  let compositeLiquidityRouter: Contract;
  let wethSigner: SignerWithAddress, alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as CompositeLiquidityRouter;
    compositeLiquidityRouter = await task.deployedInstance(CONTRACT_NAME);

    wethSigner = await impersonate(input.WETH, fp(100));
    alice = await getSigner();
  });

  it('checks composite liquidity router version', async () => {
    const version = JSON.parse(await compositeLiquidityRouter.version());
    expect(version.name).to.be.eq(CONTRACT_NAME);
    expect(version.version).to.be.eq(VERSION);
    expect(version.deployment).to.be.eq(TASK_NAME);
  });

  it('checks getters', async () => {
    expect(await compositeLiquidityRouter.getVault()).to.eq(input.Vault);
    expect(await compositeLiquidityRouter.getPermit2()).to.eq(input.Permit2);
    expect(await compositeLiquidityRouter.getWeth()).to.eq(input.WETH);
  });

  it('only accepts ETH from WETH', async () => {
    await expect(
      wethSigner.sendTransaction({ to: compositeLiquidityRouter.target.toString(), value: ethers.parseEther('1.0') })
    ).to.not.be.reverted;

    await expect(
      alice.sendTransaction({ to: compositeLiquidityRouter.target.toString(), value: ethers.parseEther('1.0') })
    ).to.be.reverted;
  });
});
