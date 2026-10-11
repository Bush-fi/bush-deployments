import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { fp } from '@helpers/numbers';
import { describeForkTest, getForkedNetwork, impersonate, Task, TaskMode } from '@src';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { SetAuthorizerDeployment } from '../input';
import { TimelockAuthorizerDeployment } from '../../../tasks/20260827-v3-timelock-authorizer/input';

// The public Robinhood Chain RPC is not archival, so the fork is taken from the current head rather than a fixed block.
describeForkTest('SetAuthorizer', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20261011-v3-set-authorizer';
  const AUTHORIZER_TASK_NAME = '20260827-v3-timelock-authorizer';
  const GRANT_TASK_NAME = '20260827-v3-grant-permissions';

  let task: Task, grantTask: Task;
  let input: SetAuthorizerDeployment;
  let authorizer: Contract, vaultAsAdmin: Contract, vaultAsExtension: Contract;
  let root: SignerWithAddress, admin: SignerWithAddress;
  let bootstrapAuthorizer: string;

  before('deploy the authorizer', async () => {
    const authorizerTask = new Task(AUTHORIZER_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await authorizerTask.run({ force: true });
    authorizer = await authorizerTask.deployedInstance('TimelockAuthorizer');

    const authorizerInput = authorizerTask.input() as TimelockAuthorizerDeployment;
    root = await impersonate(authorizerInput.Root, fp(100));

    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    grantTask = new Task(GRANT_TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    input = task.input() as SetAuthorizerDeployment;
    admin = await impersonate(input.Admin, fp(100));

    const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY, getForkedNetwork(hre));
    vaultAsAdmin = (await vaultTask.deployedInstance('VaultAdmin')).attach(input.Vault) as Contract;
    vaultAsExtension = (await vaultTask.deployedInstance('VaultExtension')).attach(input.Vault) as Contract;
    bootstrapAuthorizer = await vaultAsExtension.getAuthorizer();
  });

  it('refuses to switch before the permissions are granted', async () => {
    await expect(task.run({ force: true, from: root })).to.be.rejectedWith('permission(s) are not in place');
    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(bootstrapAuthorizer);
  });

  it('switches the Vault to the TimelockAuthorizer once they are', async () => {
    await grantTask.run({ force: true, from: root });
    await task.run({ force: true, from: root });

    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(authorizer.target.toString());
  });

  it('leaves the admin in control of the Vault', async () => {
    await (vaultAsAdmin.connect(admin) as Contract).pauseVault();
    expect(await vaultAsAdmin.isVaultPaused()).to.be.true;
    await (vaultAsAdmin.connect(admin) as Contract).unpauseVault();
    expect(await vaultAsAdmin.isVaultPaused()).to.be.false;
  });

  it('takes control away from the previous owner', async () => {
    await expect((vaultAsAdmin.connect(root) as Contract).pauseVault()).to.be.reverted;
  });

  it('is a no-op once the Vault uses the TimelockAuthorizer', async () => {
    await task.run({ force: true, from: root });

    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(authorizer.target.toString());
  });

  it('lets the admin point the Vault elsewhere', async () => {
    await (vaultAsAdmin.connect(admin) as Contract).setAuthorizer(bootstrapAuthorizer);

    expect(await vaultAsExtension.getAuthorizer()).to.be.eq(bootstrapAuthorizer);
  });
});
