import { Task, TaskMode, TaskRunOptions } from '@src';
import logger from '../../../src/logger';
import { verifyOnEtherscan } from '../../../src/etherscanVerifier';

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
  const factory = await task.deploy('ERC4626RateProviderFactory', [], from, force);
  await verifyEtherscan(task, 'ERC4626RateProviderFactory', factory.target.toString());
};
