import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import { ONES_BYTES32, ZERO_ADDRESS, ZERO_BYTES32 } from '@helpers/constants';
import { BushContracts, getBushAdmin, loadBushContracts } from '@helpers/bushFork';
import owner from '../input';

describeForkTest('V3-BootstrapAuthorizer', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260730-v3-bootstrap-authorizer';
  const CONTRACT_NAME = 'BootstrapAuthorizer';

  let task: Task;
  let contracts: BushContracts;
  let bootstrapAuthorizer: Contract;
  let ownerSigner: SignerWithAddress, other: SignerWithAddress;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    bootstrapAuthorizer = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    ownerSigner = await impersonate(owner, fp(100));
    other = await getSigner();
  });

  it('sets the owner', async () => {
    expect(await bootstrapAuthorizer.owner()).to.be.eq(owner);
  });

  it('lets the owner perform any action anywhere', async () => {
    for (const actionId of [ZERO_BYTES32, ONES_BYTES32]) {
      for (const where of [ZERO_ADDRESS, contracts.vault.target.toString()]) {
        expect(await bootstrapAuthorizer.canPerform(actionId, owner, where)).to.be.true;
      }
    }
  });

  it('lets nobody else perform anything', async () => {
    for (const account of [other.address, ZERO_ADDRESS, bootstrapAuthorizer.target.toString()]) {
      expect(await bootstrapAuthorizer.canPerform(ONES_BYTES32, account, contracts.vault.target.toString())).to.be
        .false;
    }
  });

  it('is the authorizer the vault was deployed with', async () => {
    // The live deployment used the same owner, so it must match the address the vault-factory task passed in.
    const liveAuthorizer = await task.instanceAt(
      CONTRACT_NAME,
      task.output({ network: getForkedNetwork(hre) })[CONTRACT_NAME]
    );
    expect(await liveAuthorizer.owner()).to.be.eq(owner);
  });

  describe('as the vault authorizer', () => {
    before('point the vault at it', async () => {
      // The admin is allowed to `setAuthorizer` whichever authorizer the Vault is currently on.
      const admin = await getBushAdmin();
      await (contracts.vaultAsAdmin.connect(admin) as Contract).setAuthorizer(bootstrapAuthorizer.target.toString());

      expect(await contracts.vaultAsExtension.getAuthorizer()).to.be.eq(bootstrapAuthorizer.target.toString());
    });

    it('lets the owner call permissioned vault functions', async () => {
      await (contracts.vaultAsAdmin.connect(ownerSigner) as Contract).pauseVault();
      expect(await contracts.vaultAsAdmin.isVaultPaused()).to.be.true;

      await (contracts.vaultAsAdmin.connect(ownerSigner) as Contract).unpauseVault();
      expect(await contracts.vaultAsAdmin.isVaultPaused()).to.be.false;
    });

    it('blocks everyone else', async () => {
      await expect((contracts.vaultAsAdmin.connect(other) as Contract).pauseVault()).to.be.revertedWithCustomError(
        contracts.vaultAsAdmin,
        'SenderNotAllowed'
      );
    });
  });
});
