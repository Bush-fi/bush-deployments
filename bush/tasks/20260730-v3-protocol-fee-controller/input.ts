import { fp } from '@helpers/numbers';

export type ProtocolFeeControllerDeployment = {
  Vault: string;
  InitialGlobalProtocolSwapFee: bigint;
  InitialGlobalProtocolYieldFee: bigint;
};

const Vault = '0xB055000fbE3cc9bDE7742C583a86cc6283E3fF85';

const initialGlobalProtocolSwapFee = fp(0.5);
const initialGlobalProtocolYieldFee = fp(0.5);

export default {
  Vault,
  InitialGlobalProtocolSwapFee: initialGlobalProtocolSwapFee,
  InitialGlobalProtocolYieldFee: initialGlobalProtocolYieldFee,
};
