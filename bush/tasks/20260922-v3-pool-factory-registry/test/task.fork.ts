import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { ZERO_ADDRESS } from '@helpers/constants';
import { BushContracts, getBushAdmin, loadBushContracts } from '@helpers/bushFork';
import { PoolFactoryRegistryDeployment } from '../input';

describeForkTest('V3-PoolFactoryRegistry', 'robinhoodchain', 'latest', function () {
  enum HookMode {
    NONE,
    OPTIONAL,
    SPECIFIC,
  }

  const TASK_NAME = '20260922-v3-pool-factory-registry';
  const CONTRACT_NAME = 'PoolFactoryRegistry';

  const WEIGHTED_TASK = '20260803-v3-weighted-pool';
  const STABLE_TASK = '20260803-v3-stable-pool';

  let task: Task;
  let input: PoolFactoryRegistryDeployment;
  let contracts: BushContracts;
  let registry: Contract;
  let admin: SignerWithAddress, other: SignerWithAddress;

  let weightedFactory: string, stableFactory: string;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as PoolFactoryRegistryDeployment;
    registry = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    weightedFactory = contracts.weightedPoolFactory.target.toString();
    stableFactory = contracts.stablePoolFactory.target.toString();

    // The registry authenticates through the Vault's Authorizer, which the admin controls either way: as bootstrap
    // owner, or as timelock root.
    admin = await getBushAdmin();
    other = await getSigner();
  });

  it('deploys with correct Vault', async () => {
    expect(await registry.getVault()).to.eq(input.Vault);
    expect(await registry.getAuthorizer()).to.eq(await contracts.vaultAsExtension.getAuthorizer());
  });

  it('starts empty', async () => {
    expect(await registry.getPoolFactoryCount()).to.eq(0);
    expect(await registry.getPoolFactories()).to.deep.eq([]);
  });

  it('does not let unauthorized accounts register', async () => {
    await expect(
      (registry.connect(other) as Contract).registerPoolFactory(
        WEIGHTED_TASK,
        weightedFactory,
        'WEIGHTED',
        HookMode.NONE,
        ZERO_ADDRESS
      )
    ).to.be.revertedWithCustomError(registry, 'SenderNotAllowed');
  });

  it('validates the hook against the hook mode', async () => {
    await expect(
      (registry.connect(admin) as Contract).registerPoolFactory(
        WEIGHTED_TASK,
        weightedFactory,
        'WEIGHTED',
        HookMode.SPECIFIC,
        ZERO_ADDRESS
      )
    ).to.be.revertedWithCustomError(registry, 'ZeroHookAddress');

    await expect(
      (registry.connect(admin) as Contract).registerPoolFactory(
        WEIGHTED_TASK,
        weightedFactory,
        'WEIGHTED',
        HookMode.NONE,
        other.address
      )
    ).to.be.revertedWithCustomError(registry, 'UnexpectedHookAddress');
  });

  it('registers factories', async () => {
    await (registry.connect(admin) as Contract).registerPoolFactory(
      WEIGHTED_TASK,
      weightedFactory,
      'WEIGHTED',
      HookMode.NONE,
      ZERO_ADDRESS
    );
    await (registry.connect(admin) as Contract).registerPoolFactory(
      STABLE_TASK,
      stableFactory,
      'STABLE',
      HookMode.OPTIONAL,
      ZERO_ADDRESS
    );

    expect(await registry.getPoolFactoryCount()).to.eq(2);
    expect(await registry.getPoolFactories()).to.deep.eq([weightedFactory, stableFactory]);
    expect(await registry.getPoolFactoryAt(0)).to.eq(weightedFactory);
  });

  it('looks factories up by name and address', async () => {
    const [factory, info] = await registry.getPoolFactory(WEIGHTED_TASK);
    expect(factory).to.eq(weightedFactory);
    expect(info.name).to.eq(WEIGHTED_TASK);
    expect(info.poolType).to.eq('WEIGHTED');
    expect(info.hookMode).to.eq(HookMode.NONE);
    expect(info.hook).to.eq(ZERO_ADDRESS);
    expect(info.isRegistered).to.be.true;
    expect(info.isActive).to.be.true;

    const stableInfo = await registry.getPoolFactoryInfo(stableFactory);
    expect(stableInfo.poolType).to.eq('STABLE');
    expect(stableInfo.hookMode).to.eq(HookMode.OPTIONAL);
    expect(await registry.getPoolFactoryHook(stableFactory)).to.eq(ZERO_ADDRESS);
  });

  it('filters factories by type', async () => {
    expect(await registry.isActivePoolFactory(weightedFactory)).to.be.true;
    expect(await registry.isActivePoolFactoryOfType('WEIGHTED', weightedFactory)).to.be.true;
    expect(await registry.isActivePoolFactoryOfType('STABLE', weightedFactory)).to.be.false;

    expect(await registry.getPoolFactoriesByType('WEIGHTED', true)).to.deep.eq([weightedFactory]);
    expect(await registry.getPoolFactoriesByType('STABLE', true)).to.deep.eq([stableFactory]);
    expect(await registry.getPoolFactoriesByType('LBP', true)).to.deep.eq([]);
  });

  it('rejects duplicate registrations', async () => {
    await expect(
      (registry.connect(admin) as Contract).registerPoolFactory(
        'another-name',
        weightedFactory,
        'WEIGHTED',
        HookMode.NONE,
        ZERO_ADDRESS
      )
    ).to.be.revertedWithCustomError(registry, 'FactoryAddressAlreadyRegistered');

    await expect(
      (registry.connect(admin) as Contract).registerPoolFactory(
        WEIGHTED_TASK,
        other.address,
        'WEIGHTED',
        HookMode.NONE,
        ZERO_ADDRESS
      )
    ).to.be.revertedWithCustomError(registry, 'FactoryNameAlreadyRegistered');
  });

  it('deprecates factories', async () => {
    await (registry.connect(admin) as Contract).deprecatePoolFactory(stableFactory);

    expect(await registry.isActivePoolFactory(stableFactory)).to.be.false;
    expect(await registry.getPoolFactoriesByType('STABLE', true)).to.deep.eq([]);
    expect(await registry.getPoolFactoriesByType('STABLE', false)).to.deep.eq([stableFactory]);

    const info = await registry.getPoolFactoryInfo(stableFactory);
    expect(info.isRegistered).to.be.true;
    expect(info.isActive).to.be.false;

    await expect(
      (registry.connect(admin) as Contract).deprecatePoolFactory(stableFactory)
    ).to.be.revertedWithCustomError(registry, 'FactoryAlreadyDeprecated');
  });

  it('deregisters factories', async () => {
    await (registry.connect(admin) as Contract).deregisterPoolFactory(WEIGHTED_TASK);

    expect(await registry.getPoolFactoryCount()).to.eq(1);
    expect((await registry.getPoolFactoryInfo(weightedFactory)).isRegistered).to.be.false;
    expect((await registry.getPoolFactory(WEIGHTED_TASK))[0]).to.eq(ZERO_ADDRESS);

    await expect(
      (registry.connect(admin) as Contract).deregisterPoolFactory(WEIGHTED_TASK)
    ).to.be.revertedWithCustomError(registry, 'FactoryNameNotRegistered');
  });
});
