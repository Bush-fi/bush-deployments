import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';
import '@typechain/hardhat';
import 'hardhat-local-networks-config-plugin';
import 'hardhat-ignore-warnings';
import 'tsconfig-paths/register';

import './src/helpers/setupTests';

import { task } from 'hardhat/config';
import { TASK_TEST } from 'hardhat/builtin-tasks/task-names';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import path from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';

import { checkArtifact, extractArtifact } from './src/artifact';
import test from './src/test';
import Task, { TaskMode, TaskStatus } from './src/task';
import { verifyOnSourcify } from './src/sourcifyVerifier';
import { verifyOnBlockscout } from './src/blockscoutVerifier';
import { verifyOnEtherscan } from './src/etherscanVerifier';
import logger, { Logger } from './src/logger';
import {
  checkActionIds,
  checkActionIdUniqueness,
  saveActionIds,
  getActionIdInfo,
  fetchTheGraphPermissions,
} from './src/actionId';
import {
  checkContractDeploymentAddresses,
  checkTimelockAuthorizerConfig,
  getTimelockAuthorizerConfigDiff,
  saveContractDeploymentAddresses,
  saveTimelockAuthorizerConfig,
  withRetries,
} from './src/network';
const THEGRAPHURLS: { [key: string]: string } = {};

task('deploy', 'Run deployment task')
  .addParam('id', 'Deployment task ID')
  .addFlag('force', 'Ignore previous deployments')
  .setAction(async (args: { id: string; force?: boolean; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);

    await new Task(args.id, TaskMode.LIVE, hre.network.name).run(args);
  });

task('verify-contract', `Verify a task's deployment on Sourcify (https://sourcify.dev)`)
  .addParam('id', 'Deployment task ID')
  .addParam('name', 'Contract name')
  .addParam('address', 'Contract address')
  .addParam('args', 'ABI-encoded constructor arguments')
  .setAction(
    async (
      args: { id: string; name: string; address: string; args: string; verbose?: boolean },
      hre: HardhatRuntimeEnvironment
    ) => {
      Logger.setDefaults(false, args.verbose || false);

      // Contracts can only be verified in Live mode
      await new Task(args.id, TaskMode.LIVE, hre.network.name).verify(args.name, args.address, args.args);
    }
  );

task(
  'verify-sourcify',
  `Verify a task's deployment on Sourcify (https://sourcify.dev), independent of Etherscan/Blockscout`
)
  .addParam('id', 'Deployment task ID')
  .addParam('name', 'Contract name')
  .addParam('address', 'Contract address')
  .setAction(
    async (args: { id: string; name: string; address: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
      Logger.setDefaults(false, args.verbose || false);

      const chainId = parseInt(await hre.network.provider.send('eth_chainId'), 16);
      const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);

      const url = await verifyOnSourcify(task, hre.network, args.name, args.address, chainId);
      logger.success(`Verified ${args.name} on Sourcify at ${url}`);
    }
  );

task('verify-blockscout', `Verify a task's deployment on the network's Blockscout instance`)
  .addParam('id', 'Deployment task ID')
  .addParam('name', 'Contract name')
  .addParam('address', 'Contract address')
  .setAction(
    async (args: { id: string; name: string; address: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
      Logger.setDefaults(false, args.verbose || false);

      const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);

      const url = await verifyOnBlockscout(task, hre, args.name, args.address);
      logger.success(`Verified ${args.name} on Blockscout at ${url}`);
    }
  );

task(
  'verify-etherscan',
  `Verify a task's deployment on Etherscan (v2 multichain API), independent of Sourcify/Blockscout`
)
  .addParam('id', 'Deployment task ID')
  .addParam('name', 'Contract name')
  .addParam('address', 'Contract address')
  .addOptionalParam(
    'args',
    "JSON array of the raw (unencoded) constructor argument values used at deploy time; only required for a contract created by another contract's call rather than by its own top-level transaction"
  )
  .setAction(
    async (
      args: { id: string; name: string; address: string; args?: string; verbose?: boolean },
      hre: HardhatRuntimeEnvironment
    ) => {
      Logger.setDefaults(false, args.verbose || false);

      const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
      const constructorArgs = args.args !== undefined ? JSON.parse(args.args) : undefined;

      const url = await verifyOnEtherscan(task, hre, args.name, args.address, constructorArgs);
      logger.success(`Verified ${args.name} on Etherscan at ${url}`);
    }
  );

task('extract-artifacts', `Extract contract artifacts from their build-info`)
  .addOptionalParam('id', 'Specific task ID')
  .addOptionalParam('file', 'Target build-info file name')
  .addOptionalParam('name', 'Contract name')
  .setAction(async (args: { id?: string; file?: string; name?: string; verbose?: boolean }) => {
    Logger.setDefaults(false, args.verbose || false);

    if (args.id) {
      const task = new Task(args.id, TaskMode.READ_ONLY);
      extractArtifact(task, args.file, args.name);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        const task = new Task(taskID, TaskMode.READ_ONLY);
        extractArtifact(task, args.file, args.name);
      }
    }
  });

task('check-deployments', `Check that all tasks' deployments correspond to their build-info and inputs`)
  .addOptionalParam('id', 'Specific task ID')
  .setAction(async (args: { id?: string; force?: boolean; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    // The force argument above is actually not passed (and not required or used in CHECK mode), but it is the easiest
    // way to address type issues.

    Logger.setDefaults(false, args.verbose || false);
    logger.log(`Checking deployments for ${hre.network.name}...`, '');

    if (args.id) {
      await new Task(args.id, TaskMode.CHECK, hre.network.name).run(args);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        if (taskID.startsWith('00000000-')) {
          continue;
        }

        const task = new Task(taskID, TaskMode.CHECK, hre.network.name);
        const outputDir = path.resolve(task.dir(), 'output');

        if (existsSync(outputDir) && statSync(outputDir).isDirectory()) {
          const outputFiles = readdirSync(outputDir);
          if (outputFiles.some((outputFile) => outputFile.includes(hre.network.name))) {
            // Not all tasks have outputs for all networks, so we skip those that don't
            await withRetries(async () => task.run(args));
          }
        }
      }
    }
  });

task('check-artifacts', `check that contract artifacts correspond to their build-info`)
  .addOptionalParam('id', 'Specific task ID')
  .setAction(async (args: { id?: string; verbose?: boolean }) => {
    Logger.setDefaults(false, args.verbose || false);

    if (args.id) {
      const task = new Task(args.id, TaskMode.READ_ONLY);
      checkArtifact(task);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        const task = new Task(taskID, TaskMode.READ_ONLY);
        checkArtifact(task);
      }
    }
  });

task('save-action-ids', `Print the action IDs for a particular contract and checks their uniqueness`)
  .addOptionalParam('id', 'Specific task ID')
  .addOptionalParam('name', 'Contract name')
  .addOptionalParam('address', 'Address of Pool created from a factory')
  .addOptionalParam('factory', 'Name of pool factory (only if it is not `<contract>Factory`')
  .setAction(
    async (
      args: { id: string; name: string; address?: string; factory?: string; verbose?: boolean },
      hre: HardhatRuntimeEnvironment
    ) => {
      async function saveActionIdsTask(
        args: { id: string; name: string; address?: string; factory?: string; verbose?: boolean },
        hre: HardhatRuntimeEnvironment
      ) {
        Logger.setDefaults(false, args.verbose || false);

        // The user is calculating action IDs for a contract which isn't included in the task outputs.
        // Most likely this is for a pool which is to be deployed from a factory contract deployed as part of the task.
        if (args.address) {
          if (!args.id || !args.name) {
            throw new Error(
              "Provided an address for Pool created from a factory but didn't specify task or contract name."
            );
          }
          const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
          await saveActionIds(task, args.name, args.address, args.factory);
          return;
        }

        // The user is calculating the action IDs for a particular task or contract within a particular task.
        if (args.id && args.name) {
          const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
          await saveActionIds(task, args.name);
          return;
        }

        async function generateActionIdsForTask(taskId: string): Promise<void> {
          const task = new Task(taskId, TaskMode.READ_ONLY, hre.network.name);
          const outputDir = path.resolve(task.dir(), 'output');

          if (existsSync(outputDir) && statSync(outputDir).isDirectory()) {
            for (const outputFile of readdirSync(outputDir)) {
              const outputFilePath = path.resolve(outputDir, outputFile);
              if (outputFile.includes(hre.network.name) && statSync(outputFilePath).isFile()) {
                const fileContents = JSON.parse(readFileSync(outputFilePath).toString());
                const contractNames = Object.keys(fileContents);

                for (const contractName of contractNames) {
                  // Not every output entry is a contract the task deploys directly: instances created by a factory
                  // (e.g. the mock pools) are saved under a name that has no artifact of its own. Those are recorded
                  // by calling this task explicitly with `--name <artifact> --address <instance>`, so skip them here
                  // rather than failing the entire run.
                  try {
                    task.artifact(contractName);
                  } catch {
                    logger.warn(`Skipping ${contractName} of ${taskId}: no artifact found in the task`);
                    continue;
                  }

                  await saveActionIds(task, contractName);
                }
              }
            }
          }
        }

        if (args.id) {
          await generateActionIdsForTask(args.id);
          return;
        }

        // We're calculating action IDs for whichever contracts we can pull enough information from disk for.
        // This will calculate action IDs for any contracts which are a named output from a task.
        for (const taskID of Task.getAllTaskIds()) {
          await generateActionIdsForTask(taskID);
        }
      }

      await saveActionIdsTask(args, hre);
      checkActionIdUniqueness(hre.network.name);
    }
  );

task('check-action-ids', `Check that contract action-ids correspond the expected values`)
  .addOptionalParam('id', 'Specific task ID')
  .setAction(async (args: { id?: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    logger.log(`Checking action IDs for ${hre.network.name}...`, '');

    if (args.id) {
      const task = new Task(args.id, TaskMode.READ_ONLY, hre.network.name);
      await checkActionIds(task);
    } else {
      for (const taskID of Task.getAllTaskIds()) {
        const task = new Task(taskID, TaskMode.READ_ONLY, hre.network.name);
        await withRetries(async () => checkActionIds(task));
      }
    }
    checkActionIdUniqueness(hre.network.name);
  });

task('get-action-id-info', `Returns all the matches for the given actionId`)
  .addPositionalParam('id', 'ActionId to use for the lookup')
  .setAction(async (args: { id: string; verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    logger.info(`Looking for action ID info on ${hre.network.name}...`);

    const actionIdInfo = await getActionIdInfo(args.id, hre.network.name);
    if (actionIdInfo) {
      logger.log(`Found the following matches:`, '');
      logger.log(JSON.stringify(actionIdInfo, null, 2), '');
    } else {
      logger.log(`No entries found for the actionId`, '');
    }
  });

task('get-action-ids-info', `Reconstructs all the permissions from TheGraph AP and action-ids files`).setAction(
  async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    logger.log(`Fetching permissions using TheGraph API on ${hre.network.name}...`, '');

    const permissions = await fetchTheGraphPermissions(THEGRAPHURLS[hre.network.name]);

    const infos = (
      await Promise.all(permissions.map((permission) => getActionIdInfo(permission.action.id, hre.network.name)))
    ).map((info, index) => ({
      ...info,
      grantee: permissions[index].account,
      actionId: permissions[index].action.id,
      txHash: permissions[index].txHash,
    }));
    logger.log(`Found the following matches:`, '');
    process.stdout.write(JSON.stringify(infos, null, 2));
  }
);

task('build-address-lookup', `Build a lookup table from contract addresses to the relevant deployment`).setAction(
  async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);
    if (hre.network.name === 'hardhat') {
      logger.warn(`invalid network: ${hre.network.name}`);
      return;
    }

    // Create Task objects, excluding tokens tasks.
    const tasks = Task.getAllTaskIds()
      .filter((taskId) => !taskId.startsWith('00000000-'))
      .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name));

    saveContractDeploymentAddresses(tasks, hre.network.name);
    logger.success(`Address lookup generated for network ${hre.network.name}`);
  }
);

task(
  'check-address-lookup',
  `Check whether the existing lookup table from contract addresses to the relevant deployments is correct`
).setAction(async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
  Logger.setDefaults(false, args.verbose || false);
  if (hre.network.name === 'hardhat') {
    logger.warn(`invalid network: ${hre.network.name}`);
    return;
  }

  // Create Task objects, excluding tokens tasks.
  const tasks = Task.getAllTaskIds()
    .filter((taskId) => !taskId.startsWith('00000000-'))
    .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name));

  const addressLookupFileOk = checkContractDeploymentAddresses(tasks, hre.network.name);
  if (!addressLookupFileOk) {
    throw new Error(
      `Address lookup file is incorrect for network ${hre.network.name}. Please run 'build-address-lookup' to regenerate it`
    );
  } else {
    logger.success(`Address lookup file is correct for network ${hre.network.name}`);
  }
});

task('build-timelock-authorizer-config', `Builds JSON file with Timelock Authorizer configuration`).setAction(
  async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
    Logger.setDefaults(false, args.verbose || false);

    if (hre.network.name === 'hardhat') {
      logger.warn(`invalid network: ${hre.network.name}`);
      return;
    }

    // Get active timelock authorizer task.
    const tasks = Task.getAllTaskIds()
      .filter((taskId) => taskId.includes('timelock-authorizer'))
      .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name))
      .filter((task) => task.getStatus() === TaskStatus.ACTIVE);

    if (tasks.length !== 1) {
      const errorMsg = tasks.length === 0 ? 'not found' : 'is not unique';
      logger.error(`Active timelock authorizer task ${errorMsg}`);
      return;
    }

    saveTimelockAuthorizerConfig(tasks[0], hre.network.name);

    logger.success(`Timelock Authorizer config JSON generated for network ${hre.network.name}`);
  }
);

task(
  'check-timelock-authorizer-config',
  `Check whether the existing timelock authorizer configuration file is correct`
).setAction(async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
  Logger.setDefaults(false, args.verbose || false);

  if (hre.network.name === 'hardhat') {
    logger.warn(`invalid network: ${hre.network.name}`);
    return;
  }

  // Get active timelock authorizer task.
  const tasks = Task.getAllTaskIds()
    .filter((taskId) => taskId.includes('timelock-authorizer'))
    .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name))
    .filter((task) => task.getStatus() === TaskStatus.ACTIVE);

  if (tasks.length !== 1) {
    const errorMsg = tasks.length === 0 ? 'not found' : 'is not unique';
    logger.error(`Active timelock authorizer task ${errorMsg}`);
    return;
  }

  const isConfigOk = checkTimelockAuthorizerConfig(tasks[0], hre.network.name);

  if (isConfigOk) {
    logger.success(`Timelock Authorizer config JSON is correct for network ${hre.network.name}`);
  } else {
    throw new Error(
      `Timelock Authorizer config file is incorrect for network ${hre.network.name}. Please run 'build-timelock-authorizer-config' to regenerate it`
    );
  }
});

task(
  'verify-timelock-authorizer-config',
  `Check whether the existing timelock authorizer configuration file matches the delays configured onchain`
).setAction(async (args: { verbose?: boolean }, hre: HardhatRuntimeEnvironment) => {
  Logger.setDefaults(false, args.verbose || false);

  if (hre.network.name === 'hardhat') {
    logger.warn(`invalid network: ${hre.network.name}`);
    return;
  }

  // Get active timelock authorizer task.
  const tasks = Task.getAllTaskIds()
    .filter((taskId) => taskId.includes('timelock-authorizer'))
    .map((taskId) => new Task(taskId, TaskMode.READ_ONLY, hre.network.name))
    .filter((task) => task.getStatus() === TaskStatus.ACTIVE);

  if (tasks.length !== 1) {
    const errorMsg = tasks.length === 0 ? 'not found' : 'is not unique';
    logger.error(`Active timelock authorizer task ${errorMsg}`);
    return;
  }

  const configDiff = await getTimelockAuthorizerConfigDiff(tasks[0], hre.network.name);

  if (configDiff.length === 0) {
    logger.success(`Timelock Authorizer config is correctly applied on-chain for network ${hre.network.name}`);
  } else {
    throw new Error(
      `Timelock Authorizer config file is incorrect for network ${
        hre.network.name
      }. Differences found:\n${JSON.stringify(configDiff, null, 2)}`
    );
  }
});

task(TASK_TEST).addOptionalParam('id', 'Specific task ID of the fork test to run.').setAction(test);

export default {
  typechain: {
    target: 'ethers-v6',
    outDir: '.src/typechain-types',
  },
  mocha: {
    timeout: 600000,
  },
  solidity: {
    compilers: [
      {
        version: '0.8.26',
        settings: {
          evmVersion: 'cancun',
          optimizer: {
            enabled: true,
            runs: 9999,
          },
        },
      },
    ],
  },
  paths: {
    artifacts: './src/helpers/.hardhat/artifacts',
    cache: './src/helpers/.hardhat/cache',
    sources: './src/helpers/contracts',
  },
  warnings: {
    '*': {
      'shadowing-opcode': 'off',
      default: 'error',
    },
  },
  sourcify: {
    enabled: true,
  },
  blockscout: {
    enabled: true,
    customChains: [
      {
        // Contract verification must be submitted to the chain's own Blockscout instance: the multichain PRO API at
        // api.blockscout.com proxies reads, but errors out on `verifysourcecode`.
        network: 'robinhoodchain',
        chainId: 4663,
        urls: {
          apiURL: 'https://robinhoodchain.blockscout.com/api',
          browserURL: 'https://robinhoodchain.blockscout.com',
        },
      },
    ],
  },
  etherscan: {
    customChains: [
      {
        network: 'robinhoodchain',
        chainId: 4663,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=4663',
          browserURL: 'https://robin.etherscan.io/',
        },
      },
    ],
  },
};
