import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { describeForkTest, getForkedNetwork, Task, TaskMode } from '@src';
import { getBushAdmin } from '@helpers/bushFork';
import { VaultFactoryDeployment } from '../input';

// The factory and the Vault it created are checked in place: the Vault's CREATE2 address is derived from the
// factory's address, so redeploying either on the fork would not reproduce the live addresses.
describeForkTest('V3-VaultFactory', 'robinhoodchain', 'latest', function () {
  let task: Task;
  let input: VaultFactoryDeployment;
  let vaultFactory: Contract, vault: Contract, vaultExtension: Contract, vaultAdmin: Contract;

  before('load deployed contracts', async () => {
    task = new Task('20260730-v3-vault-factory', TaskMode.READ_ONLY, getForkedNetwork(hre));
    input = task.input() as VaultFactoryDeployment;

    vaultFactory = await task.deployedInstance('VaultFactory');
    vault = await task.deployedInstance('Vault');
    vaultExtension = await task.deployedInstance('VaultExtension');
    vaultAdmin = await task.deployedInstance('VaultAdmin');
  });

  it('checks vault address', async () => {
    expect(vault.target.toString()).to.be.eq(input.targetVaultAddress);
    expect(await vaultFactory.getDeploymentAddress(input.salt)).to.be.eq(input.targetVaultAddress);
  });

  it('records the vault as deployed', async () => {
    const vaultAddress = vault.target.toString();

    expect(await vaultFactory.isDeployed(vaultAddress)).to.be.true;
    expect(await vaultFactory.deployedVaultAdmins(vaultAddress)).to.be.eq(vaultAdmin.target.toString());
    expect(await vaultFactory.deployedVaultExtensions(vaultAddress)).to.be.eq(vaultExtension.target.toString());
  });

  it('checks the artifacts match the ones in the vault task', async () => {
    // The factory pins the creation code of the Vault contracts, and this task reads it from `20260730-v3-vault3`.
    const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, getForkedNetwork(hre));

    expect(input.vaultCreationCode).to.be.eq(vaultTask.artifact('Vault').bytecode);
    expect(input.vaultExtensionCreationCode).to.be.eq(vaultTask.artifact('VaultExtension').bytecode);
    expect(input.vaultAdminCreationCode).to.be.eq(vaultTask.artifact('VaultAdmin').bytecode);
  });

  it('checks the vault wiring', async () => {
    expect(await vaultAdmin.vault()).to.be.equal(vault.target.toString());
    expect(await vaultExtension.vault()).to.be.equal(vault.target.toString());
    expect(await vault.getVaultExtension()).to.be.eq(vaultExtension.target.toString());
    expect(await vaultExtension.getVaultAdmin()).to.be.eq(vaultAdmin.target.toString());
  });

  it('checks the protocol fee controller passed to the vault', async () => {
    const feeControllerTask = new Task(
      '20260730-v3-protocol-fee-controller',
      TaskMode.READ_ONLY,
      getForkedNetwork(hre)
    );
    const vaultAsExtension = vaultExtension.attach(vault.target.toString()) as Contract;

    expect(await vaultAsExtension.getProtocolFeeController()).to.be.equal(
      feeControllerTask.output().ProtocolFeeController
    );
  });

  it('checks vaultAdmin constants', async () => {
    const vaultAsAdmin = vaultAdmin.attach(vault.target.toString()) as Contract;

    expect(await vaultAsAdmin.getMinimumTradeAmount()).to.be.equal(input.minTradeAmount);
    expect(await vaultAsAdmin.getMinimumWrapAmount()).to.be.equal(input.minWrapAmount);
    expect(await vaultAsAdmin.getBufferPeriodDuration()).to.be.equal(input.bufferPeriodDuration);
  });

  it('cannot deploy the same vault twice', async () => {
    const admin = await getBushAdmin();

    await expect(
      (vaultFactory.connect(admin) as Contract).create(
        input.salt,
        input.targetVaultAddress,
        await (vaultExtension.attach(vault.target.toString()) as Contract).getProtocolFeeController(),
        input.vaultCreationCode,
        input.vaultExtensionCreationCode,
        input.vaultAdminCreationCode
      )
    ).to.be.revertedWithCustomError(vaultFactory, 'VaultAlreadyDeployed');
  });
});
