import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { describeForkTest, getForkedNetwork, Task, TaskMode } from '@src';
import { MONTH } from '@helpers/time';

// This task holds the Vault artifacts; the Vault itself was deployed through `20260730-v3-vault-factory`. These
// tests check the live deployment rather than redeploying it, since the Vault's CREATE2 address depends on the
// factory that deployed it.
describeForkTest('Vault-V3', 'robinhoodchain', 'latest', function () {
  let task: Task;
  let vault: Contract, vaultExtension: Contract, vaultAdmin: Contract;
  let vaultAsExtension: Contract, vaultAsAdmin: Contract;

  before('load deployed contracts', async () => {
    task = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, getForkedNetwork(hre));

    vault = await task.deployedInstance('Vault');
    vaultExtension = await task.deployedInstance('VaultExtension');
    vaultAdmin = await task.deployedInstance('VaultAdmin');

    vaultAsExtension = vaultExtension.attach(vault.target.toString()) as Contract;
    vaultAsAdmin = vaultAdmin.attach(vault.target.toString()) as Contract;
  });

  it('checks admin reference', async () => {
    expect(await vaultAdmin.vault()).to.be.equal(vault.target.toString());
  });

  it('checks extension reference', async () => {
    expect(await vaultExtension.vault()).to.be.equal(vault.target.toString());
  });

  it('checks extension', async () => {
    expect(await vault.getVaultExtension()).to.be.eq(vaultExtension.target.toString());
  });

  it('checks admin', async () => {
    expect(await vaultExtension.getVaultAdmin()).to.be.eq(vaultAdmin.target.toString());
  });

  it('checks protocol fee controller reference', async () => {
    const feeControllerTask = new Task(
      '20260730-v3-protocol-fee-controller',
      TaskMode.READ_ONLY,
      getForkedNetwork(hre)
    );
    expect(await vaultAsExtension.getProtocolFeeController()).to.be.equal(
      feeControllerTask.output().ProtocolFeeController
    );
  });

  it('checks authorizer reference', async () => {
    // The Vault is deployed pointing at the bootstrap authorizer, and later handed over to the timelock authorizer.
    const bootstrapTask = new Task('20260730-v3-bootstrap-authorizer', TaskMode.READ_ONLY, getForkedNetwork(hre));
    const timelockTask = new Task('20260827-v3-timelock-authorizer', TaskMode.READ_ONLY, getForkedNetwork(hre));

    expect(await vaultAsExtension.getAuthorizer()).to.be.oneOf([
      bootstrapTask.output().BootstrapAuthorizer,
      timelockTask.output().TimelockAuthorizer,
    ]);
  });

  it('checks vaultAdmin constants', async () => {
    expect(await vaultAsAdmin.getMinimumTradeAmount()).to.be.equal(1e6);
    expect(await vaultAsAdmin.getMinimumWrapAmount()).to.be.equal(1e4);
    expect(await vaultAsAdmin.getMinimumPoolTokens()).to.be.equal(2);
    expect(await vaultAsAdmin.getMaximumPoolTokens()).to.be.equal(8);
    expect(await vaultAsAdmin.getBufferPeriodDuration()).to.be.equal(MONTH * 6);
    expect(await vaultAsAdmin.getBufferPeriodEndTime()).to.be.equal(
      (await vaultAsAdmin.getPauseWindowEndTime()) + BigInt(MONTH * 6)
    );
  });

  it('is not paused', async () => {
    expect(await vaultAsAdmin.isVaultPaused()).to.be.false;
    expect(await vaultAsExtension.isQueryDisabled()).to.be.false;
  });
});
