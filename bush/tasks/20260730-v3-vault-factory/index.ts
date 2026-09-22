import { VaultFactoryDeployment } from './input';
import { Task, TaskMode, TaskRunOptions } from '@src';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as VaultFactoryDeployment;

  const vaultFactory = await task.instanceAt('VaultFactory', '0x6418e85A3fb7CE32B85E09FD5100AC37b9103Cb2');

  // task.save({ VaultFactory: vaultFactory });

  // Sanity check that the factory was deployed correctly.
  const vaultAddress = await vaultFactory.getDeploymentAddress(input.salt);
  if (vaultAddress !== input.targetVaultAddress) {
    throw Error('Incorrect target address');
  }

  // ProtocolFeeController was already deployed separately; load its real bytecode into the task's local EVM
  // state so the bytecode check below can correctly simulate Vault's constructor call to `protocolFeeController.vault()`.
  await task.saveInInternalEVMState('0xCC699Ad77Cdf45605C3eB776bF79599c1b80BF91');

  // Deploy the Vault contracts.
  const deployTransaction = await task.deployFactoryContracts(
    await vaultFactory.create.populateTransaction(
      input.salt,
      vaultAddress,
      '0xCC699Ad77Cdf45605C3eB776bF79599c1b80BF91',
      input.vaultCreationCode,
      input.vaultExtensionCreationCode,
      input.vaultAdminCreationCode,
      { gasLimit: 15e6 }
    ),
    ['Vault', 'VaultExtension', 'VaultAdmin'],
    (await vaultFactory.isDeployed(vaultAddress)) === false,
    from,
    force
  );

  const vaultAdminAddress = await vaultFactory.deployedVaultAdmins(vaultAddress);
  const vaultExtensionAddress = await vaultFactory.deployedVaultExtensions(vaultAddress);

  // Pass this in, since the artifacts are not included in this task.
  const vaultTask = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);

  // NOTE: contractsInfo must be sorted by deployment order
  await task.saveAndVerifyFactoryContracts(
    [
      {
        name: 'VaultAdmin',
        expectedAddress: vaultAdminAddress,
        args: [
          vaultAddress,
          input.pauseWindowDuration,
          input.bufferPeriodDuration,
          input.minTradeAmount,
          input.minWrapAmount,
        ],
      },
      {
        name: 'VaultExtension',
        expectedAddress: vaultExtensionAddress,
        args: [vaultAddress, vaultAdminAddress],
      },
      {
        name: 'Vault',
        expectedAddress: vaultAddress,
        args: [vaultExtensionAddress, input.Authorizer, '0xCC699Ad77Cdf45605C3eB776bF79599c1b80BF91'],
      },
    ],
    deployTransaction,
    vaultTask
  );
};
