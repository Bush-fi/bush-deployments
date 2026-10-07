import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import { MAX_UINT256, ZERO_ADDRESS, ZERO_BYTES32 } from '@helpers/constants';
import { BushContracts, getBushAdmin, loadBushContracts, mintTestToken } from '@helpers/bushFork';
import { LiquidityZapperDeployment } from '../input';

describeForkTest('V3-LiquidityZapper', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260917-v3-zapper';
  const CONTRACT_NAME = 'LiquidityZapper';

  let task: Task;
  let input: LiquidityZapperDeployment;
  let contracts: BushContracts;
  let zapper: Contract;
  let admin: SignerWithAddress, alice: SignerWithAddress;

  // A zap with no swaps, joining no pool: enough to exercise the parameter checks.
  const emptyZap = (overrides: Record<string, unknown> = {}) => ({
    tokenIn: ZERO_ADDRESS,
    swaps: [],
    pool: ZERO_ADDRESS,
    newPool: {
      factory: ZERO_ADDRESS,
      name: '',
      symbol: '',
      tokenConfigs: [],
      normalizedWeights: [],
      roleAccounts: { pauseManager: ZERO_ADDRESS, swapFeeManager: ZERO_ADDRESS, poolCreator: ZERO_ADDRESS },
      swapFeePercentage: 0,
      poolHooksContract: ZERO_ADDRESS,
      enableDonation: false,
      disableUnbalancedLiquidity: false,
      salt: ZERO_BYTES32,
    },
    minBptAmountOut: 0,
    recipient: alice.address,
    deadline: MAX_UINT256,
    ...overrides,
  });

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as LiquidityZapperDeployment;
    zapper = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    admin = await getBushAdmin();
    alice = await getSigner();
  });

  it('checks configuration', async () => {
    expect(await zapper.getVault()).to.eq(input.Vault);
    expect(await zapper.getBalancerRouter()).to.eq(input.Router);
    expect(await zapper.getUmbraRouter()).to.eq(input.UmbraRouter);
    expect(await zapper.getAuthorizer()).to.eq(await contracts.vaultAsExtension.getAuthorizer());
  });

  it('rejects zaps with no swaps', async () => {
    await expect((zapper.connect(alice) as Contract).zap(emptyZap())).to.be.revertedWithCustomError(zapper, 'NoSwaps');
  });

  it('rejects expired zaps', async () => {
    await expect((zapper.connect(alice) as Contract).zap(emptyZap({ deadline: 0 }))).to.be.revertedWithCustomError(
      zapper,
      'ZapExpired'
    );
  });

  it('rejects zaps to the zero address', async () => {
    await expect(
      (zapper.connect(alice) as Contract).zap(emptyZap({ recipient: ZERO_ADDRESS }))
    ).to.be.revertedWithCustomError(zapper, 'ZeroRecipient');
  });

  describe('governance', () => {
    it('lets governance change the umbra router', async () => {
      const newUmbraRouter = alice.address;

      await (zapper.connect(admin) as Contract).setUmbraRouter(newUmbraRouter);
      expect(await zapper.getUmbraRouter()).to.eq(newUmbraRouter);

      await (zapper.connect(admin) as Contract).setUmbraRouter(input.UmbraRouter);
      expect(await zapper.getUmbraRouter()).to.eq(input.UmbraRouter);
    });

    it('does not let anyone else change the umbra router', async () => {
      await expect((zapper.connect(alice) as Contract).setUmbraRouter(alice.address)).to.be.revertedWithCustomError(
        zapper,
        'SenderNotAllowed'
      );
    });

    it('lets governance rescue stuck tokens', async () => {
      const amount = fp(10);
      await mintTestToken(contracts.testToken, zapper.target.toString(), amount);

      const balanceBefore = await contracts.testToken.balanceOf(alice.address);
      await (zapper.connect(admin) as Contract).rescue(contracts.testToken.target.toString(), alice.address, amount);

      expect((await contracts.testToken.balanceOf(alice.address)) - balanceBefore).to.eq(amount);
      expect(await contracts.testToken.balanceOf(zapper.target.toString())).to.eq(0);
    });

    it('does not let anyone else rescue tokens', async () => {
      await expect(
        (zapper.connect(alice) as Contract).rescue(contracts.testToken.target.toString(), alice.address, 0)
      ).to.be.revertedWithCustomError(zapper, 'SenderNotAllowed');
    });
  });
});
