import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { fp } from '@helpers/numbers';
import { ZERO_ADDRESS } from '@helpers/constants';
import { describeForkTest, getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { ContractType, RegistryInitializerDeployment } from '../input';
import { TimelockAuthorizerDeployment } from '../../../tasks/20260827-v3-timelock-authorizer/input';

// The public Robinhood Chain RPC is not archival, so the fork is taken from the current head rather than a fixed block.
describeForkTest('RegistryInitializer', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260830-v3-registry-initializer';
  const AUTHORIZER_TASK_NAME = '20260827-v3-timelock-authorizer';
  const REGISTRY_TASK_NAME = '20260802-v3-contract-registry';

  let task: Task;
  let input: RegistryInitializerDeployment;
  let registry: Contract;
  let root: SignerWithAddress;

  before('deploy a fresh registry', async () => {
    // The live registry has already been initialized, so the task is exercised against a new, empty one. In TEST
    // mode the task reads the registry from this test output.
    const registryTask = new Task(REGISTRY_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await registryTask.run({ force: true });
    registry = await registryTask.deployedInstance('BushContractRegistry');
  });

  before('hand the vault over to the timelock authorizer and grant permissions', async () => {
    const authorizerTask = new Task(AUTHORIZER_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await authorizerTask.run({ force: true });
    const authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

    const authorizerInput = authorizerTask.input() as TimelockAuthorizerDeployment;
    root = await impersonate(authorizerInput.Root, fp(100));

    const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, getForkedNetwork(hre));
    const vault = await vaultTask.deployedInstance('Vault');
    const vaultAsAdmin = (await vaultTask.deployedInstance('VaultAdmin')).attach(vault.target.toString()) as Contract;

    await (vaultAsAdmin.connect(root) as Contract).setAuthorizer(authorizer.target.toString());

    // `20260827-v3-grant-permissions` grants these on the live registry; the fresh one needs its own grants.
    for (const fn of ['registerBushContract', 'addOrUpdateBushContractAlias']) {
      const actionId = await registry.getActionId(registry.interface.getFunction(fn)!.selector);
      await (authorizer.connect(root) as Contract).grantPermission(actionId, root.address, registry.target.toString());
    }
  });

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    input = task.input() as RegistryInitializerDeployment;

    // Nothing is registered before the task runs.
    for (const { address } of input.Registrations) {
      expect((await registry.getBushContractInfo(address)).isRegistered).to.be.false;
    }

    await task.run({ force: true, from: root });
  });

  it('registers every contract with the right type', async () => {
    for (const { address, contractType } of input.Registrations) {
      const info = await registry.getBushContractInfo(address);

      expect(info.isRegistered).to.be.true;
      expect(info.isActive).to.be.true;
      expect(info.contractType).to.be.eq(BigInt(contractType));
    }
  });

  it('registers every contract under its task ID', async () => {
    for (const { name, address, contractType } of input.Registrations) {
      const [registeredAddress, isActive] = await registry.getBushContract(contractType, name);

      expect(registeredAddress).to.be.eq(address);
      expect(isActive).to.be.true;
    }
  });

  it('points the aliases at the right addresses', async () => {
    for (const { address, contractType, contractAlias } of input.Registrations) {
      if (contractAlias === undefined) continue;

      const [aliasAddress] = await registry.getBushContract(contractType, contractAlias);
      expect(aliasAddress).to.be.eq(address);
    }
  });

  it('leaves contracts without an alias unaliased', async () => {
    // The buffer router is registered but deliberately has no alias, so looking up its contract name is the only way
    // to find it. A stray alias here would be a silent input error.
    const unaliased = input.Registrations.filter((registration) => registration.contractAlias === undefined);
    expect(unaliased).to.not.be.empty;

    for (const { contractType } of unaliased) {
      expect((await registry.getBushContract(contractType, 'BufferRouter'))[0]).to.be.eq(ZERO_ADDRESS);
    }
  });

  it('trusts the registered routers, and nothing else', async () => {
    for (const { address, contractType } of input.Registrations) {
      expect(await registry.isTrustedRouter(address)).to.be.eq(contractType === ContractType.ROUTER);
    }

    expect(await registry.isTrustedRouter('0x0000000000000000000000000000000000000042')).to.be.false;
  });

  it('is idempotent', async () => {
    // `registerBushContract` reverts on an already registered address, so a second run must skip them instead.
    await task.run({ force: true, from: root });

    for (const { name, address, contractType } of input.Registrations) {
      expect((await registry.getBushContract(contractType, name))[0]).to.be.eq(address);
    }
  });
});
