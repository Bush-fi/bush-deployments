import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import { ZERO_BYTES32 } from '@helpers/constants';
import {
  approveViaPermit2,
  BushContracts,
  createWeightedPool,
  getQuerySigner,
  loadBushContracts,
  mintTestToken,
  standardTokenConfig,
} from '@helpers/bushFork';
import { RouterDeployment } from '../input';

describeForkTest('V3-Router', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260801-v3-router';
  const CONTRACT_NAME = 'Router';
  const VERSION = 1;

  const initialBalanceWETH = fp(10);
  const initialBalanceTEST = fp(1000);

  let task: Task;
  let input: RouterDeployment;
  let contracts: BushContracts;
  let router: Contract, pool: Contract;
  let wethSigner: SignerWithAddress, alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as RouterDeployment;
    router = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    wethSigner = await impersonate(input.WETH, fp(100));
    alice = await getSigner();
  });

  before('create pool', async () => {
    const tokenConfig = standardTokenConfig([input.WETH, contracts.testToken.target.toString()]);
    const poolAddress = await createWeightedPool(contracts.weightedPoolFactory, tokenConfig, [fp(0.5), fp(0.5)]);

    const poolTask = new Task('20260803-v3-weighted-pool', TaskMode.READ_ONLY, getForkedNetwork(hre));
    pool = await poolTask.instanceAt('WeightedPool', poolAddress);
  });

  it('checks router version', async () => {
    const routerVersion = JSON.parse(await router.version());
    expect(routerVersion.name).to.be.eq(CONTRACT_NAME);
    expect(routerVersion.version).to.be.eq(VERSION);
    expect(routerVersion.deployment).to.be.eq(TASK_NAME);
  });

  it('checks getters', async () => {
    expect(await router.getVault()).to.eq(input.Vault);
    expect(await router.getPermit2()).to.eq(input.Permit2);
    expect(await router.getWeth()).to.eq(input.WETH);
  });

  it('only accepts ETH from WETH', async () => {
    await expect(wethSigner.sendTransaction({ to: router.target.toString(), value: ethers.parseEther('1.0') })).to.not
      .be.reverted;

    await expect(alice.sendTransaction({ to: router.target.toString(), value: ethers.parseEther('1.0') })).to.be
      .reverted;
  });

  it('initializes a pool with native ETH', async () => {
    const bob = await getSigner(1);
    const TEST = contracts.testToken.target.toString();

    await setBalance(bob.address, fp(100));
    await mintTestToken(contracts.testToken, bob.address, initialBalanceTEST);
    await approveViaPermit2(contracts.testToken, contracts.permit2, bob, router.target.toString(), initialBalanceTEST);

    const bptOut = await (router.connect(bob) as Contract).initialize.staticCall(
      pool.target.toString(),
      [TEST, input.WETH],
      [initialBalanceTEST, initialBalanceWETH],
      0,
      true, // wethIsEth
      ZERO_BYTES32,
      { value: initialBalanceWETH }
    );

    await (router.connect(bob) as Contract).initialize(
      pool.target.toString(),
      [TEST, input.WETH],
      [initialBalanceTEST, initialBalanceWETH],
      0,
      true,
      ZERO_BYTES32,
      { value: initialBalanceWETH }
    );

    expect(await contracts.vaultAsExtension.isPoolInitialized(pool.target.toString())).to.be.true;
    expect(await pool.balanceOf(bob.address)).to.be.eq(bptOut);

    const { tokens, balancesRaw } = await contracts.vaultAsExtension.getPoolTokenInfo(pool.target.toString());
    const wethIndex = tokens.findIndex((token: string) => token.toLowerCase() === input.WETH.toLowerCase());
    expect(balancesRaw[wethIndex]).to.be.eq(initialBalanceWETH);
    expect(balancesRaw[1 - wethIndex]).to.be.eq(initialBalanceTEST);
  });

  it('swaps through the pool', async () => {
    const TEST = contracts.testToken.target.toString();
    const amountIn = fp(10);

    await mintTestToken(contracts.testToken, alice.address, amountIn);
    await approveViaPermit2(contracts.testToken, contracts.permit2, alice, router.target.toString(), amountIn);

    const querySigner = await getQuerySigner();
    const expectedAmountOut = await (router.connect(querySigner) as Contract).querySwapSingleTokenExactIn.staticCall(
      pool.target.toString(),
      TEST,
      input.WETH,
      amountIn,
      alice.address,
      '0x'
    );
    expect(expectedAmountOut).to.be.gt(0);

    const wethBefore = await contracts.weth.balanceOf(alice.address);
    await (router.connect(alice) as Contract).swapSingleTokenExactIn(
      pool.target.toString(),
      TEST,
      input.WETH,
      amountIn,
      expectedAmountOut,
      ethers.MaxUint256, // deadline
      false, // wethIsEth
      '0x'
    );

    expect((await contracts.weth.balanceOf(alice.address)) - wethBefore).to.be.eq(expectedAmountOut);
  });
});
