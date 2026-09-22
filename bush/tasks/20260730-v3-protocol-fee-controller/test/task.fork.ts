import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import * as expectEvent from '@helpers/expectEvent';
import { ZERO_ADDRESS } from '@helpers/constants';
import { BushContracts, getBushAdmin, loadBushContracts, standardTokenConfig, TokenConfig } from '@helpers/bushFork';
import { ProtocolFeeControllerDeployment } from '../input';

describeForkTest('V3-ProtocolFeeController', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260730-v3-protocol-fee-controller';
  const CONTRACT_NAME = 'ProtocolFeeController';
  const POOL_CONTRACT_NAME = 'WeightedPool';

  const GLOBAL_SWAP_FEE_PERCENTAGE = fp(0.05);
  const GLOBAL_YIELD_FEE_PERCENTAGE = fp(0.25);

  let task: Task;
  let input: ProtocolFeeControllerDeployment;
  let contracts: BushContracts;
  let feeController: Contract, pool: Contract;
  let admin: SignerWithAddress;
  let tokenConfig: TokenConfig[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poolCreationReceipt: any;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as ProtocolFeeControllerDeployment;
    feeController = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    tokenConfig = standardTokenConfig([contracts.weth.target.toString(), contracts.testToken.target.toString()]);

    // `setProtocolFeeController` and the global fee setters are permissioned. The admin is allowed through whichever
    // authorizer the Vault is on: as bootstrap owner, or as timelock root with the permissions granted by
    // `20260827-v3-grant-permissions`.
    admin = await getBushAdmin();
  });

  it('deploys contract', async () => {
    expect(await feeController.vault()).to.eq(input.Vault);
  });

  it('has correct initial fees', async () => {
    expect(await feeController.getGlobalProtocolSwapFeePercentage()).to.eq(input.InitialGlobalProtocolSwapFee);
    expect(await feeController.getGlobalProtocolYieldFeePercentage()).to.eq(input.InitialGlobalProtocolYieldFee);
  });

  it('replaces the old fee controller', async () => {
    const oldFeeControllerAddress = await contracts.vaultAsExtension.getProtocolFeeController();

    await (contracts.vaultAsAdmin.connect(admin) as Contract).setProtocolFeeController(feeController.target.toString());

    const newFeeControllerAddress = await contracts.vaultAsExtension.getProtocolFeeController();
    expect(newFeeControllerAddress).not.to.equal(oldFeeControllerAddress);
    expect(newFeeControllerAddress).to.eq(feeController.target.toString());
  });

  it('sets non-zero global fees', async () => {
    await (feeController.connect(admin) as Contract).setGlobalProtocolSwapFeePercentage(GLOBAL_SWAP_FEE_PERCENTAGE);
    await (feeController.connect(admin) as Contract).setGlobalProtocolYieldFeePercentage(GLOBAL_YIELD_FEE_PERCENTAGE);

    expect(await feeController.getGlobalProtocolSwapFeePercentage()).to.equal(GLOBAL_SWAP_FEE_PERCENTAGE);
    expect(await feeController.getGlobalProtocolYieldFeePercentage()).to.equal(GLOBAL_YIELD_FEE_PERCENTAGE);
  });

  it('deploys a pool and gets the events', async () => {
    const factory = contracts.weightedPoolFactory;

    poolCreationReceipt = await (
      await factory.create(
        'Fee Controller Test Pool',
        'FCTP',
        tokenConfig,
        [fp(0.8), fp(0.2)],
        { pauseManager: ZERO_ADDRESS, swapFeeManager: ZERO_ADDRESS, poolCreator: ZERO_ADDRESS },
        fp(0.01),
        ZERO_ADDRESS,
        false,
        false,
        '0x' + '12'.repeat(32)
      )
    ).wait();

    const event = expectEvent.inReceipt(poolCreationReceipt, 'PoolCreated');
    const poolTask = new Task('20260803-v3-weighted-pool', TaskMode.READ_ONLY, getForkedNetwork(hre));
    pool = await poolTask.instanceAt(POOL_CONTRACT_NAME, event.args.pool);
  });

  it('checks pool deployment', async () => {
    const poolTokens = (await pool.getTokens()).map((token: string) => token.toLowerCase());
    expect(poolTokens).to.be.deep.eq(tokenConfig.map((config) => config.token.toLowerCase()));
  });

  it('pool creation emits initial fee events', async () => {
    const swapFeeEvent = expectEvent.inIndirectReceipt(
      poolCreationReceipt,
      feeController.interface,
      'InitialPoolAggregateSwapFeePercentage'
    );

    expect(swapFeeEvent.args.pool).to.eq(pool.target.toString());
    expect(swapFeeEvent.args.aggregateSwapFeePercentage).to.equal(GLOBAL_SWAP_FEE_PERCENTAGE);
    expect(swapFeeEvent.args.isProtocolFeeExempt).to.be.false;

    const yieldFeeEvent = expectEvent.inIndirectReceipt(
      poolCreationReceipt,
      feeController.interface,
      'InitialPoolAggregateYieldFeePercentage'
    );

    expect(yieldFeeEvent.args.pool).to.eq(pool.target.toString());
    expect(yieldFeeEvent.args.aggregateYieldFeePercentage).to.equal(GLOBAL_YIELD_FEE_PERCENTAGE);
    expect(yieldFeeEvent.args.isProtocolFeeExempt).to.be.false;

    const poolCreatorEvent = expectEvent.inIndirectReceipt(
      poolCreationReceipt,
      feeController.interface,
      'PoolRegisteredWithFeeController'
    );

    expect(poolCreatorEvent.args.pool).to.eq(pool.target.toString());
    expect(poolCreatorEvent.args.poolCreator).to.equal(ZERO_ADDRESS);
    expect(poolCreatorEvent.args.protocolFeeExempt).to.be.false;
  });

  it('checks pool aggregate fees', async () => {
    const [aggregateSwapFeePercentage, aggregateYieldFeePercentage] = await pool.getAggregateFeePercentages();

    expect(aggregateSwapFeePercentage).to.equal(GLOBAL_SWAP_FEE_PERCENTAGE);
    expect(aggregateYieldFeePercentage).to.equal(GLOBAL_YIELD_FEE_PERCENTAGE);
  });

  it('has pool getters', async () => {
    expect(await feeController.isPoolRegistered(pool.target.toString())).to.be.true;
    expect(await feeController.getPoolCreatorSwapFeePercentage(pool.target.toString())).to.equal(0);
    expect(await feeController.getPoolCreatorYieldFeePercentage(pool.target.toString())).to.equal(0);
  });
});
