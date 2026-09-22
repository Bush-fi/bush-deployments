import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import {
  approveViaPermit2,
  BushContracts,
  deployWrappedToken,
  loadBushContracts,
  mintTestToken,
} from '@helpers/bushFork';
import { BufferRouterDeployment } from '../input';

describeForkTest('V3-BufferRouter', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260801-v3-buffer-router';
  const CONTRACT_NAME = 'BufferRouter';
  const VERSION = 1;

  const initialUnderlying = fp(1000);

  let task: Task;
  let input: BufferRouterDeployment;
  let contracts: BushContracts;
  let bufferRouter: Contract, wrappedTest: Contract;
  let wethSigner: SignerWithAddress, alice: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as BufferRouterDeployment;
    bufferRouter = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    wethSigner = await impersonate(input.WETH, fp(100));
    alice = await getSigner();
  });

  before('deploy wrapped token', async () => {
    // There are no ERC4626 tokens on the chain, so the buffer is created around a mock wrapper of TEST.
    wrappedTest = await deployWrappedToken(contracts, contracts.testToken, alice);
  });

  it('checks buffer router version', async () => {
    const bufferRouterVersion = JSON.parse(await bufferRouter.version());
    expect(bufferRouterVersion.name).to.be.eq(CONTRACT_NAME);
    expect(bufferRouterVersion.version).to.be.eq(VERSION);
    expect(bufferRouterVersion.deployment).to.be.eq(TASK_NAME);
  });

  it('checks getters', async () => {
    expect(await bufferRouter.getVault()).to.eq(input.Vault);
    expect(await bufferRouter.getPermit2()).to.eq(input.Permit2);
    expect(await bufferRouter.getWeth()).to.eq(input.WETH);
  });

  it('only accepts ETH from WETH', async () => {
    await expect(wethSigner.sendTransaction({ to: bufferRouter.target.toString(), value: ethers.parseEther('1.0') })).to
      .not.be.reverted;

    await expect(alice.sendTransaction({ to: bufferRouter.target.toString(), value: ethers.parseEther('1.0') })).to.be
      .reverted;
  });

  it('initializes a buffer', async () => {
    const wrapped = wrappedTest.target.toString();
    expect(await contracts.vaultAsExtension.isERC4626BufferInitialized(wrapped)).to.be.false;

    await mintTestToken(contracts.testToken, alice.address, initialUnderlying);
    await approveViaPermit2(
      contracts.testToken,
      contracts.permit2,
      alice,
      bufferRouter.target.toString(),
      initialUnderlying
    );

    await (bufferRouter.connect(alice) as Contract).initializeBuffer(wrapped, initialUnderlying, 0, 0);

    expect(await contracts.vaultAsExtension.isERC4626BufferInitialized(wrapped)).to.be.true;
    expect(await contracts.vaultAsExtension.getERC4626BufferAsset(wrapped)).to.be.eq(
      contracts.testToken.target.toString()
    );

    const [underlyingBalance, wrappedBalance] = await contracts.vaultAsAdmin.getBufferBalance(wrapped);
    expect(underlyingBalance).to.be.eq(initialUnderlying);
    expect(wrappedBalance).to.be.eq(0);
    expect(await contracts.vaultAsAdmin.getBufferOwnerShares(wrapped, alice.address)).to.be.gt(0);
  });

  it('adds liquidity to the buffer', async () => {
    const wrapped = wrappedTest.target.toString();
    const sharesBefore = await contracts.vaultAsAdmin.getBufferOwnerShares(wrapped, alice.address);
    const [underlyingBefore] = await contracts.vaultAsAdmin.getBufferBalance(wrapped);

    const extraUnderlying = fp(100);
    await mintTestToken(contracts.testToken, alice.address, extraUnderlying);
    await approveViaPermit2(
      contracts.testToken,
      contracts.permit2,
      alice,
      bufferRouter.target.toString(),
      extraUnderlying
    );

    // Adding liquidity is proportional; with no wrapped tokens in the buffer only the underlying side is pulled, so
    // 5% of the current shares costs about 5% of the underlying balance, well within the max.
    await (bufferRouter.connect(alice) as Contract).addLiquidityToBuffer(
      wrapped,
      extraUnderlying,
      0,
      sharesBefore / 20n
    );

    const [underlyingAfter] = await contracts.vaultAsAdmin.getBufferBalance(wrapped);
    expect(underlyingAfter).to.be.gt(underlyingBefore);
    expect(await contracts.vaultAsAdmin.getBufferOwnerShares(wrapped, alice.address)).to.be.gt(sharesBefore);
  });
});
