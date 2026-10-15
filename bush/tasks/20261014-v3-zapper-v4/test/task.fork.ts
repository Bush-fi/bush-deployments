import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { MAX_UINT256, ZERO_ADDRESS, ZERO_BYTES32 } from '@helpers/constants';
import { BushContracts, loadBushContracts, standardTokenConfig } from '@helpers/bushFork';
import { LiquidityZapperDeployment } from '../input';

describeForkTest('V3-MultiRouterLiquidityZapper-V4', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20261014-v3-zapper-v4';
  const CONTRACT_NAME = 'MultiRouterLiquidityZapper';
  const VERSION = 4;

  let task: Task;
  let input: LiquidityZapperDeployment;
  let contracts: BushContracts;
  let zapper: Contract;
  let alice: SignerWithAddress;

  // A zap with no swaps, seeding a new pool: enough to exercise the parameter checks, which run before any transfer.
  const emptyZap = (overrides: Record<string, unknown> = {}) => ({
    tokenIn: ZERO_ADDRESS,
    swaps: [],
    directAmountIn: 0,
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
    alice = await getSigner();
  });

  it('checks version', async () => {
    const version = JSON.parse(await zapper.version());
    expect(version.deployment).to.be.eq(TASK_NAME);
    expect(version.version).to.be.eq(VERSION);
    expect(version.name).to.be.eq(CONTRACT_NAME);
  });

  it('checks configuration', async () => {
    expect(await zapper.getVault()).to.eq(input.Vault);
    expect(await zapper.getRouter()).to.eq(input.Router);
    expect(await zapper.getWeth()).to.eq(await contracts.router.getWeth());
    expect(await zapper.getAuthorizer()).to.eq(await contracts.vaultAsExtension.getAuthorizer());
  });

  it('allowlists the initial swap routers', async () => {
    expect(await zapper.isSwapRouterAllowed(input.UmbraRouter)).to.be.true;
    expect(await zapper.isSwapRouterAllowed(input.KyberswapRouter)).to.be.true;
    expect(await zapper.isSwapRouterAllowed(alice.address)).to.be.false;
  });

  it('rejects zaps with no swaps and no direct input', async () => {
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

  it('rejects direct input of a token the pool does not hold', async () => {
    // Native direct input is deposited as WETH, which this new pool does not hold.
    const zap = emptyZap({
      directAmountIn: 1,
      newPool: { ...emptyZap().newPool, tokenConfigs: standardTokenConfig([contracts.testToken.target.toString()]) },
    });

    await expect((zapper.connect(alice) as Contract).zap(zap, { value: 1 }))
      .to.be.revertedWithCustomError(zapper, 'DirectInputNotInPool')
      .withArgs(await zapper.getWeth());
  });

  // Governance permissions on this deployment are granted after it, so no one holds them on the fork yet.
  describe('governance', () => {
    it('does not let unpermissioned accounts change the swap router allowlist', async () => {
      await expect(
        (zapper.connect(alice) as Contract).setSwapRouterAllowed(alice.address, true)
      ).to.be.revertedWithCustomError(zapper, 'SenderNotAllowed');
    });

    it('does not let unpermissioned accounts rescue tokens', async () => {
      await expect(
        (zapper.connect(alice) as Contract).rescue(contracts.testToken.target.toString(), alice.address, 0)
      ).to.be.revertedWithCustomError(zapper, 'SenderNotAllowed');
    });
  });
});
