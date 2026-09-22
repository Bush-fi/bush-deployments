import { Task, TaskMode } from '@src';
import { MONTH } from '@helpers/time';

export type VaultDeployment = {
  Authorizer: string;
  pauseWindowDuration: number;
  bufferPeriodDuration: number;
  minTradeAmount: number;
  minWrapAmount: number;
  vaultCreationCode: string;
  vaultExtensionCreationCode: string;
  vaultAdminCreationCode: string;
  salt: string;
  targetVaultAddress: string;
};

// This task holds the Vault artifacts; the actual robinhoodchain deployment went through
// `20260730-v3-vault-factory`, which reads the creation code from here. Inputs below mirror that deployment.
// BootstrapAuthorizer (`20260730-v3-bootstrap-authorizer`).
const Authorizer = '0x49a74571c34c456A1c55e2374e55DEaBc1B1B969';
const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);

const vaultArtifact = Vault.artifact('Vault');
const vaultCreationCode = vaultArtifact.bytecode;

const vaultExtensionArtifact = Vault.artifact('VaultExtension');
const vaultExtensionCreationCode = vaultExtensionArtifact.bytecode;

const vaultAdminArtifact = Vault.artifact('VaultAdmin');
const vaultAdminCreationCode = vaultAdminArtifact.bytecode;

const salt = '0xfd8ae8bf0d2826e347abdf8900a8e3a681de638235d35faa158cfc262f4467be';
const targetVaultAddress = '0xB055000fbE3cc9bDE7742C583a86cc6283E3fF85';

export default {
  Authorizer,
  pauseWindowDuration: 4 * MONTH * 12,
  bufferPeriodDuration: 6 * MONTH,
  minTradeAmount: 1e6,
  minWrapAmount: 1e4,
  vaultCreationCode,
  vaultExtensionCreationCode,
  vaultAdminCreationCode,
  salt,
  targetVaultAddress,
};
