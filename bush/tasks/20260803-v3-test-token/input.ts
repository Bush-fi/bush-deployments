export type TestTokenDeployment = {
  Name: string;
  Symbol: string;
  Decimals: bigint;
  Supply: bigint;
};

export default {
  Name: 'Test Token',
  Symbol: 'TEST',
  Decimals: 18n,
  Supply: 1000000000000000000000000n,
};
