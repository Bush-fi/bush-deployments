import { Task, TaskMode } from '@src';
import { MONTH } from '@helpers/time';
import { fp } from '@helpers/numbers';

export type VaultFactoryDeployment = {
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
  InitialGlobalProtocolSwapFee: bigint;
  InitialGlobalProtocolYieldFee: bigint;
};

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

const initialGlobalProtocolSwapFee = fp(0.5); // 50%
const initialGlobalProtocolYieldFee = fp(0.5); // 10%

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
  InitialGlobalProtocolSwapFee: initialGlobalProtocolSwapFee,
  InitialGlobalProtocolYieldFee: initialGlobalProtocolYieldFee,
};
