import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import { MAX_UINT256, ZERO_ADDRESS } from '@helpers/constants';
import {
  approveViaPermit2,
  BushContracts,
  createInitializedWeightedPool,
  getBushAdmin,
  loadBushContracts,
  mintTestToken,
  mintWeth,
} from '@helpers/bushFork';
import { ProtocolFeeSweeperDeployment } from '../input';

describeForkTest('V3-ProtocolFeeSweeper', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260827-v3-protocol-fee-sweeper-v2';
  const CONTRACT_NAME = 'ProtocolFeeSweeper';
  const AUTHORIZER_TASK_NAME = '20260827-v3-timelock-authorizer';

  let task: Task;
  let input: ProtocolFeeSweeperDeployment;
  let contracts: BushContracts;
  let feeSweeper: Contract, feeController: Contract, pool: Contract;
  let feeRecipient: SignerWithAddress, admin: SignerWithAddress, trader: SignerWithAddress;

  let WETH: string, TEST: string;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as ProtocolFeeSweeperDeployment;
    feeSweeper = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    WETH = contracts.weth.target.toString();
    TEST = contracts.testToken.target.toString();

    const feeControllerTask = new Task(
      '20260730-v3-protocol-fee-controller',
      TaskMode.READ_ONLY,
      getForkedNetwork(hre)
    );
    feeController = await feeControllerTask.deployedInstance('ProtocolFeeController');

    feeRecipient = await impersonate(input.FeeRecipient, fp(100));
    admin = await getBushAdmin();
    trader = await getSigner();
  });

  before('grant withdrawal permission', async () => {
    // The sweeper needs `withdrawProtocolFeesForToken` on the fee controller, which the bootstrap authorizer cannot
    // grant to anyone but its owner. So the Vault is handed over to a fresh timelock authorizer (as
    // `20260827-v3-timelock-authorizer` does), whose root then grants the permission to this sweeper.
    const authorizerTask = new Task(AUTHORIZER_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await authorizerTask.run({ force: true });
    const authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

    await (contracts.vaultAsAdmin.connect(admin) as Contract).setAuthorizer(authorizer.target.toString());

    const actionId = await feeController.getActionId(
      feeController.interface.getFunction('withdrawProtocolFeesForToken')!.selector
    );
    await (authorizer.connect(admin) as Contract).grantPermission(
      actionId,
      feeSweeper.target.toString(),
      feeController.target.toString()
    );
  });

  before('create pool and accrue protocol fees', async () => {
    pool = await createInitializedWeightedPool(contracts, await getSigner(1));

    // Swap in both directions so that both tokens accrue swap fees, half of which go to the protocol.
    const amountIn = fp(10);
    await mintTestToken(contracts.testToken, trader.address, amountIn);
    await mintWeth(contracts.weth, trader, amountIn);

    const router = contracts.router.target.toString();
    await approveViaPermit2(contracts.testToken, contracts.permit2, trader, router, amountIn);
    await approveViaPermit2(contracts.weth, contracts.permit2, trader, router, amountIn);

    for (const [tokenIn, tokenOut] of [
      [TEST, WETH],
      [WETH, TEST],
    ]) {
      await (contracts.router.connect(trader) as Contract).swapSingleTokenExactIn(
        pool.target.toString(),
        tokenIn,
        tokenOut,
        amountIn,
        0,
        ethers.MaxUint256,
        false,
        '0x'
      );
    }
  });

  it('returns default parameters', async () => {
    expect(await feeSweeper.getVault()).to.eq(input.Vault);
    expect(await feeSweeper.getFeeRecipient()).to.eq(input.FeeRecipient);
    expect(await feeSweeper.getProtocolFeeController()).to.eq(feeController.target.toString());
    expect(await feeSweeper.getTargetToken()).to.eq(ZERO_ADDRESS);
  });

  it('sets target token', async () => {
    await (feeSweeper.connect(feeRecipient) as Contract).setTargetToken(TEST);

    expect(await feeSweeper.getTargetToken()).to.equal(TEST);
  });

  it('can set/remove burners', async () => {
    // Any non-zero address will do: burners are only called during a sweep that needs a swap.
    const burner = contracts.router.target.toString();

    expect(await feeSweeper.isApprovedProtocolFeeBurner(burner)).to.be.false;

    await (feeSweeper.connect(feeRecipient) as Contract).addProtocolFeeBurner(burner);
    expect(await feeSweeper.isApprovedProtocolFeeBurner(burner)).to.be.true;

    await (feeSweeper.connect(feeRecipient) as Contract).removeProtocolFeeBurner(burner);
    expect(await feeSweeper.isApprovedProtocolFeeBurner(burner)).to.be.false;
  });

  it('does not let others configure it', async () => {
    await expect((feeSweeper.connect(trader) as Contract).setTargetToken(WETH)).to.be.revertedWithCustomError(
      feeSweeper,
      'SenderNotAllowed'
    );
  });

  it('sweeps protocol fees to the fee recipient', async () => {
    // With no burner, the fee token is sent straight to the recipient regardless of the target token.
    for (const feeToken of [contracts.testToken, contracts.weth]) {
      const balanceBefore = await feeToken.balanceOf(feeRecipient.address);

      await (feeSweeper.connect(feeRecipient) as Contract).sweepProtocolFeesForToken(
        pool.target.toString(),
        feeToken.target.toString(),
        0,
        MAX_UINT256,
        ZERO_ADDRESS
      );

      expect(await feeToken.balanceOf(feeRecipient.address)).to.be.gt(balanceBefore);
      expect(await feeToken.balanceOf(feeSweeper.target.toString())).to.be.eq(0);
    }
  });

  it('can recover protocol fees', async () => {
    const amount = fp(100);
    await mintTestToken(contracts.testToken, feeSweeper.target.toString(), amount);

    const balanceBefore = await contracts.testToken.balanceOf(feeRecipient.address);
    await (feeSweeper.connect(feeRecipient) as Contract).recoverProtocolFees([TEST]);
    const balanceAfter = await contracts.testToken.balanceOf(feeRecipient.address);

    expect(balanceAfter - balanceBefore).to.equal(amount);
  });

  it('does not accept ETH', async () => {
    await expect(
      trader.sendTransaction({ to: feeSweeper.target.toString(), value: ethers.parseEther('1.0') })
    ).to.be.revertedWithCustomError(feeSweeper, 'CannotReceiveEth');
  });
});
