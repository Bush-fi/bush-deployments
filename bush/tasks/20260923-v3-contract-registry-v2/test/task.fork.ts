import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, Task, TaskMode } from '@src';
import { ZERO_ADDRESS } from '@helpers/constants';
import { BushContracts, getBushAdmin, loadBushContracts } from '@helpers/bushFork';
import { BushContractRegistryDeployment } from '../input';

describeForkTest('V3-BushContractRegistry', 'robinhoodchain', 'latest', function () {
  enum ContractType {
    OTHER,
    POOL_FACTORY,
    ROUTER,
    HOOK,
    ERC4626,
  }

  const TASK_NAME = '20260802-v3-contract-registry';
  const CONTRACT_NAME = 'BushContractRegistry';

  const FACTORY_TASK = '20260803-v3-weighted-pool';
  const ROUTER_TASK = '20260801-v3-router';

  let task: Task;
  let input: BushContractRegistryDeployment;
  let contracts: BushContracts;
  let registry: Contract;
  let admin: SignerWithAddress;

  let factory: string, router: string;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as BushContractRegistryDeployment;
    registry = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    factory = contracts.weightedPoolFactory.target.toString();
    router = contracts.router.target.toString();

    // The registry authenticates through the Vault's Authorizer. While the Vault is on the bootstrap authorizer that
    // means only the admin can register; once it's on the timelock authorizer the admin is root, and has been granted
    // these actions by `20260827-v3-grant-permissions`.
    admin = await getBushAdmin();
  });

  it('deploys with correct Vault', async () => {
    expect(await registry.getVault()).to.eq(input.Vault);
    expect(await registry.getAuthorizer()).to.eq(await contracts.vaultAsExtension.getAuthorizer());
  });

  it('does not let unauthorized accounts register', async () => {
    const other = await getSigner();

    await expect(
      (registry.connect(other) as Contract).registerBushContract(ContractType.POOL_FACTORY, FACTORY_TASK, factory)
    ).to.be.revertedWithCustomError(registry, 'SenderNotAllowed');
  });

  it('can register a contract', async () => {
    await (registry.connect(admin) as Contract).registerBushContract(ContractType.POOL_FACTORY, FACTORY_TASK, factory);
    await (registry.connect(admin) as Contract).addOrUpdateBushContractAlias('WeightedPool', factory);
  });

  it('detects active contracts', async () => {
    expect(await registry.isActiveBushContract(ContractType.POOL_FACTORY, factory)).to.be.true;

    let result = await registry.getBushContract(ContractType.POOL_FACTORY, FACTORY_TASK);
    expect(result.contractAddress).to.eq(factory);
    expect(result.isActive).to.be.true;

    result = await registry.getBushContract(ContractType.POOL_FACTORY, 'WeightedPool');
    expect(result.contractAddress).to.eq(factory);
    expect(result.isActive).to.be.true;

    const info = await registry.getBushContractInfo(factory);
    expect(info.isRegistered).to.be.true;
    expect(info.isActive).to.be.true;
    expect(info.contractType).to.eq(ContractType.POOL_FACTORY);
  });

  it('has trusted router', async () => {
    await (registry.connect(admin) as Contract).registerBushContract(ContractType.ROUTER, ROUTER_TASK, router);

    expect(await registry.isActiveBushContract(ContractType.ROUTER, router)).to.be.true;
    expect(await registry.isTrustedRouter(router)).to.be.true;
    expect(await registry.isTrustedRouter(factory)).to.be.false;
  });

  it('handles unregistered contracts', async () => {
    expect(await registry.isActiveBushContract(ContractType.ROUTER, factory)).to.be.false;
    expect(await registry.isActiveBushContract(ContractType.ERC4626, ZERO_ADDRESS)).to.be.false;

    const { contractAddress, isActive } = await registry.getBushContract(ContractType.POOL_FACTORY, 'NotThere');
    expect(contractAddress).to.equal(ZERO_ADDRESS);
    expect(isActive).to.be.false;
  });

  it('rejects duplicate registrations', async () => {
    await expect(
      (registry.connect(admin) as Contract).registerBushContract(ContractType.POOL_FACTORY, FACTORY_TASK, factory)
    ).to.be.revertedWithCustomError(registry, 'ContractAddressAlreadyRegistered');

    const otherFactory = contracts.stablePoolFactory.target.toString();
    await expect(
      (registry.connect(admin) as Contract).registerBushContract(ContractType.POOL_FACTORY, FACTORY_TASK, otherFactory)
    ).to.be.revertedWithCustomError(registry, 'ContractNameAlreadyRegistered');
  });

  it('can deprecate a contract', async () => {
    await (registry.connect(admin) as Contract).deprecateBushContract(router);

    expect(await registry.isActiveBushContract(ContractType.ROUTER, router)).to.be.false;
    expect(await registry.isTrustedRouter(router)).to.be.false;

    const info = await registry.getBushContractInfo(router);
    expect(info.isRegistered).to.be.true;
    expect(info.isActive).to.be.false;
  });

  it('can deregister a contract', async () => {
    await (registry.connect(admin) as Contract).deregisterBushContract(FACTORY_TASK);

    expect(await registry.isActiveBushContract(ContractType.POOL_FACTORY, factory)).to.be.false;
    expect((await registry.getBushContractInfo(factory)).isRegistered).to.be.false;
  });
});
