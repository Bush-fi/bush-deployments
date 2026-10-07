import { ZERO_ADDRESS, ZERO_BYTES32 } from '@helpers/constants';
import { fp } from '@helpers/numbers';
import * as expectEvent from '@helpers/expectEvent';

import { saveContractDeploymentTransactionHash } from '@src';
import { Task, TaskMode, TaskRunOptions } from '@src';
import logger from '../../../src/logger';
import { verifyOnEtherscan } from '../../../src/etherscanVerifier';
import { ReClammPoolDeployment } from './input';

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
  const input = task.input() as ReClammPoolDeployment;

  // The factory checks that the helper was deployed with the same Vault, so the helper must be deployed first.
  const helper = await task.deploy('ReClammPoolHelper', [input.Vault], from, force);
  await verifyEtherscan(task, 'ReClammPoolHelper', helper.target.toString());

  const args = [input.Vault, helper.target, input.PauseWindowDuration, input.FactoryVersion, input.PoolVersion];
  const factory = await task.deploy('ReClammPoolFactory', args, from, force);
  await verifyEtherscan(task, 'ReClammPoolFactory', factory.target.toString());

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

    // The target price is the geometric center of the range, so the pool starts fully centered.
    const newReClammPoolParams = {
      name: 'DO NOT USE - Mock ReClamm Pool',
      symbol: 'TEST',
      tokens: tokenConfig,
      roleAccounts: {
        pauseManager: ZERO_ADDRESS,
        swapFeeManager: ZERO_ADDRESS,
        poolCreator: ZERO_ADDRESS,
      },
      swapFeePercentage: fp(0.001),
      priceParams: {
        initialMinPrice: fp(0.5),
        initialMaxPrice: fp(2),
        initialTargetPrice: fp(1),
        tokenAPriceIncludesRate: false,
        tokenBPriceIncludesRate: false,
      },
      dailyPriceShiftExponent: fp(0.1),
      centerednessMargin: fp(0.2),
      salt: ZERO_BYTES32,
    };

    // This mimics the logic inside task.deploy
    if (force || !task.output({ ensure: false })['MockReClammPool']) {
      const poolCreationReceipt = await (
        await factory.create(
          newReClammPoolParams.name,
          newReClammPoolParams.symbol,
          newReClammPoolParams.tokens,
          newReClammPoolParams.roleAccounts,
          newReClammPoolParams.swapFeePercentage,
          newReClammPoolParams.priceParams,
          newReClammPoolParams.dailyPriceShiftExponent,
          newReClammPoolParams.centerednessMargin,
          newReClammPoolParams.salt
        )
      ).wait();
      const event = expectEvent.inReceipt(poolCreationReceipt, 'PoolCreated');
      const mockPoolAddress = event.args.pool;

      await saveContractDeploymentTransactionHash(mockPoolAddress, poolCreationReceipt.transactionHash, task.network);
      await task.save({ MockReClammPool: mockPoolAddress });
    }

    const mockPool = await task.instanceAt('ReClammPool', task.output()['MockReClammPool']);

    // Mirrors the ReClammPoolParams struct the factory builds in `create`.
    const poolParams = {
      name: newReClammPoolParams.name,
      symbol: newReClammPoolParams.symbol,
      version: await factory.getPoolVersion(),
      dailyPriceShiftExponent: newReClammPoolParams.dailyPriceShiftExponent,
      centerednessMargin: newReClammPoolParams.centerednessMargin,
      initialMinPrice: newReClammPoolParams.priceParams.initialMinPrice,
      initialMaxPrice: newReClammPoolParams.priceParams.initialMaxPrice,
      initialTargetPrice: newReClammPoolParams.priceParams.initialTargetPrice,
      tokenAPriceIncludesRate: newReClammPoolParams.priceParams.tokenAPriceIncludesRate,
      tokenBPriceIncludesRate: newReClammPoolParams.priceParams.tokenBPriceIncludesRate,
    };

    // The pool was created by the factory rather than by a top-level transaction, so Etherscan needs the exact
    // constructor arguments the factory passed.
    await verifyEtherscan(task, 'ReClammPool', mockPool.target.toString(), [
      poolParams,
      input.Vault,
      helper.target.toString(),
    ]);
  }
};
