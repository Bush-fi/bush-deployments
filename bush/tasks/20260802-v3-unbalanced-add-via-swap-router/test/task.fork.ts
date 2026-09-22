import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import {
  approveViaPermit2,
  BushContracts,
  createStablePool,
  initializePool,
  loadBushContracts,
  mintTestToken,
  mintWeth,
  standardTokenConfig,
} from '@helpers/bushFork';
import { AddViaSwapRouterDeployment } from '../input';

describeForkTest('V3-UnbalancedAddViaSwapRouter', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260802-v3-unbalanced-add-via-swap-router';
  const CONTRACT_NAME = 'UnbalancedAddViaSwapRouter';
  const VERSION = 1;

  const initialBalance = fp(100);

  let task: Task;
  let input: AddViaSwapRouterDeployment;
  let contracts: BushContracts;
  let unbalancedAddRouter: Contract, pool: Contract;
  let wethSigner: SignerWithAddress, alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as AddViaSwapRouterDeployment;
    unbalancedAddRouter = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    wethSigner = await impersonate(input.WETH, fp(100));
    alice = await getSigner();
  });

  before('create and seed a stable pool', async () => {
    const tokenConfig = standardTokenConfig([input.WETH, contracts.testToken.target.toString()]);
    const poolAddress = await createStablePool(contracts.stablePoolFactory, tokenConfig, 200n);

    await initializePool(
      contracts,
      await getSigner(1),
      poolAddress,
      tokenConfig.map((config) => config.token),
      tokenConfig.map(() => initialBalance)
    );

    const poolTask = new Task('20260803-v3-stable-pool', TaskMode.READ_ONLY, getForkedNetwork(hre));
    pool = await poolTask.instanceAt('StablePool', poolAddress);
  });

  it('checks router version', async () => {
    const routerVersion = JSON.parse(await unbalancedAddRouter.version());
    expect(routerVersion.name).to.be.eq(CONTRACT_NAME);
    expect(routerVersion.version).to.be.eq(VERSION);
    expect(routerVersion.deployment).to.be.eq(TASK_NAME);
  });

  it('checks router configuration', async () => {
    expect(await unbalancedAddRouter.getVault()).to.eq(input.Vault);
    expect(await unbalancedAddRouter.getWeth()).to.eq(input.WETH);
    expect(await unbalancedAddRouter.getPermit2()).to.eq(input.Permit2);
  });

  it('adds liquidity unbalanced', async () => {
    const exactAmount = fp(1);
    const maxAdjustableAmount = fp(10);

    // Calculate expected BPT to set appropriate exactBptAmountOut. Setting it slightly above proportional ensures
    // the operation uses the EXACT_OUT swap branch.
    const totalSupply = await pool.totalSupply();
    const { tokens, balancesRaw } = await contracts.vaultAsExtension.getPoolTokenInfo(pool.target.toString());
    const wethIndex = tokens.findIndex((token: string) => token.toLowerCase() === input.WETH.toLowerCase());
    const proportionalBpt = (totalSupply * exactAmount) / balancesRaw[wethIndex];

    await mintTestToken(contracts.testToken, alice.address, maxAdjustableAmount * 2n);
    await mintWeth(contracts.weth, alice, exactAmount * 2n);

    const router = unbalancedAddRouter.target.toString();
    await approveViaPermit2(contracts.testToken, contracts.permit2, alice, router, maxAdjustableAmount * 2n);
    await approveViaPermit2(contracts.weth, contracts.permit2, alice, router, exactAmount * 2n);

    const params = {
      exactBptAmountOut: proportionalBpt,
      exactToken: input.WETH,
      exactAmount: exactAmount,
      maxAdjustableAmount: maxAdjustableAmount,
      addLiquidityUserData: '0x',
      swapUserData: '0x',
    };

    const bptBalanceBefore = await pool.balanceOf(alice.address);
    const testBalanceBefore = await contracts.testToken.balanceOf(alice.address);
    const deadline = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

    await (unbalancedAddRouter.connect(alice) as Contract).addLiquidityUnbalanced(
      pool.target.toString(),
      deadline,
      false,
      params
    );

    const bptReceived = (await pool.balanceOf(alice.address)) - bptBalanceBefore;
    expect(bptReceived).to.be.eq(proportionalBpt);

    // The adjustable side (TEST) was pulled, but no more than the maximum.
    const testSpent = testBalanceBefore - (await contracts.testToken.balanceOf(alice.address));
    expect(testSpent).to.be.gt(0);
    expect(testSpent).to.be.lte(maxAdjustableAmount);
  });

  // NB: This test must go at the end, or the Router having extra ETH messes up the add liquidity test.
  it('only accepts ETH from WETH', async () => {
    await expect(
      wethSigner.sendTransaction({ to: unbalancedAddRouter.target.toString(), value: ethers.parseEther('1.0') })
    ).to.not.be.reverted;

    await expect(alice.sendTransaction({ to: unbalancedAddRouter.target.toString(), value: ethers.parseEther('1.0') }))
      .to.be.reverted;
  });
});
