import { ZERO_ADDRESS, ZERO_BYTES32 } from '@helpers/constants';
import { fp } from '@helpers/numbers';
import * as expectEvent from '@helpers/expectEvent';

import { saveContractDeploymentTransactionHash } from '@src';
import { Task, TaskMode, TaskRunOptions } from '@src';
import logger from '../../../src/logger';
import { verifyOnEtherscan } from '../../../src/etherscanVerifier';
import { WeightedPoolDeployment } from './input';

// Verifies on the network's Etherscan (robin.etherscan.io for robinhoodchain) instead of the Sourcify route used by
// `task.verify`. Like `task.verify`, this only runs in live mode and logs failures rather than aborting the task.
async function verifyEtherscan(task: Task, name: string, address: string, constructorArgs?: unknown[]): Promise<void> {
  if (task.mode !== TaskMode.LIVE) {
    return;
  }

  try {
    const hre = await import('hardhat');
    const url = await verifyOnEtherscan(task, hre, name, address, constructorArgs);
    logger.success(`Verified contract ${name} on Etherscan at ${url}`);
  } catch (error) {
    logger.error(`Failed trying to verify ${name} at ${address}: ${error}`);
  }
}

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as WeightedPoolDeployment;

  const args = [input.Vault, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  const factory = await task.deploy('WeightedPoolFactory', args, from, force);
  await verifyEtherscan(task, 'WeightedPoolFactory', factory.target.toString());

  if (task.mode === TaskMode.LIVE) {
    const tokenConfig = [
      {
        token: input.WETH,
        tokenType: 0,
        rateProvider: ZERO_ADDRESS,
        paysYieldFees: false,
      },
      {
        token: input.SimpleTestToken,
        tokenType: 0,
        rateProvider: ZERO_ADDRESS,
        paysYieldFees: false,
      },
    ].sort(function (a, b) {
      return a.token.toLowerCase().localeCompare(b.token.toLowerCase());
    });

    const newWeightedPoolParams = {
      name: 'DO NOT USE - Mock Weighted Pool',
      symbol: 'TEST',
      tokens: tokenConfig,
      normalizedWeights: [fp(0.8), fp(0.2)],
      roleAccounts: {
        pauseManager: ZERO_ADDRESS,
        swapFeeManager: ZERO_ADDRESS,
        poolCreator: ZERO_ADDRESS,
      },
      swapFeePercentage: fp(0.001),
      hooksAddress: ZERO_ADDRESS,
      enableDonations: false,
      disableUnbalancedLiquidity: false,
      salt: ZERO_BYTES32,
    };

    // This mimics the logic inside task.deploy
    if (force || !task.output({ ensure: false })['MockWeightedPool']) {
      const poolCreationReceipt = await (
        await factory.create(
          newWeightedPoolParams.name,
          newWeightedPoolParams.symbol,
          newWeightedPoolParams.tokens,
          newWeightedPoolParams.normalizedWeights,
          newWeightedPoolParams.roleAccounts,
          newWeightedPoolParams.swapFeePercentage,
          newWeightedPoolParams.hooksAddress,
          newWeightedPoolParams.enableDonations,
          newWeightedPoolParams.disableUnbalancedLiquidity,
          newWeightedPoolParams.salt
        )
      ).wait();
      const event = expectEvent.inReceipt(poolCreationReceipt, 'PoolCreated');
      const mockPoolAddress = event.args.pool;

      await saveContractDeploymentTransactionHash(mockPoolAddress, poolCreationReceipt.transactionHash, task.network);
      await task.save({ MockWeightedPool: mockPoolAddress });
    }

    const mockPool = await task.instanceAt('WeightedPool', task.output()['MockWeightedPool']);

    const poolParams = {
      name: newWeightedPoolParams.name,
      symbol: newWeightedPoolParams.symbol,
      numTokens: newWeightedPoolParams.tokens.length,
      normalizedWeights: newWeightedPoolParams.normalizedWeights,
      version: await factory.getPoolVersion(),
      minTokenBalances: await computeMinTokenBalances(newWeightedPoolParams.tokens.map((t) => t.token)),
    };

    // The pool was created by the factory rather than by a top-level transaction, so Etherscan needs the exact
    // constructor arguments the factory passed.
    await verifyEtherscan(task, 'WeightedPool', mockPool.target.toString(), [poolParams, input.Vault]);
  }
};

// Mirrors MinTokenBalanceLib.computeMinTokenBalances, which the factory uses to build the pool's constructor args.
async function computeMinTokenBalances(tokens: string[]): Promise<bigint[]> {
  const { ethers } = await import('hardhat');
  const ABSOLUTE_MIN_TOKEN_BALANCE = 10n ** 6n;
  return Promise.all(
    tokens.map(async (token) => {
      const erc20 = new ethers.Contract(token, ['function decimals() view returns (uint8)'], ethers.provider);
      const decimals = BigInt(await erc20.decimals());
      const atomicUnitFloor = 10n ** (18n - decimals);
      return atomicUnitFloor > ABSOLUTE_MIN_TOKEN_BALANCE ? atomicUnitFloor : ABSOLUTE_MIN_TOKEN_BALANCE;
    })
  );
}
