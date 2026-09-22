import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { BuildInfo, CompilerInput, CompilerOutputContract } from 'hardhat/types';

import Task from './task';
import { Network } from './types';
import { findContractSourceName } from './buildinfo';
import { getContractDeploymentTransactionHash } from './network';
import { Etherscan } from '@nomicfoundation/hardhat-verify/internal/etherscan';
import { ContractAlreadyVerifiedError } from '@nomicfoundation/hardhat-verify/internal/errors';
import { extractMatchingContractInformation } from '@nomicfoundation/hardhat-verify/internal/solc/artifacts';
import { Bytecode } from '@nomicfoundation/hardhat-verify/internal/solc/bytecode';
import logger from './logger';

/**
 * Verifies a deployed contract on the current network's Etherscan (v2 multichain API), by submitting the task's
 * `build-info` standard-json-input. The `etherscan.customChains` entry matching the network's chain ID provides the
 * API and browser URLs, and the network's `verificationAPIKey` (set in `~/.hardhat/networks.json`) is used as the
 * Etherscan API key.
 *
 * Note that the stock `hardhat verify` task cannot be used in this repository: it verifies against the project's
 * compiled sources, and the deployed contracts' sources are not checked in - only their build info is. So, as in
 * `verifyOnSourcify` and `verifyOnBlockscout`, we submit the standard-json-input that solc was given at deploy time.
 *
 * Unlike Sourcify and Blockscout, Etherscan's `verifysourcecode` endpoint requires the exact ABI-encoded constructor
 * arguments up front (it has no auto-detection). Where possible, we derive them from the contract's recorded
 * deployment transaction (see `/deployment-txs`): its calldata is the creation bytecode followed by the constructor
 * arguments, so slicing off a prefix of the same length as the build info's creation bytecode leaves exactly the
 * encoded arguments, regardless of whether any library placeholders were linked. This doesn't work for a contract
 * created by another contract's call (e.g. a pool instantiated by a factory, or the Vault/VaultAdmin/VaultExtension
 * trio created together by VaultFactory) rather than by a top-level transaction of its own, since there the
 * transaction's calldata is a call to the creator rather than creation code; for those, pass the raw (unencoded)
 * constructor argument values actually used at deploy time via `constructorArgs`.
 */
export async function verifyOnEtherscan(
  task: Task,
  hre: HardhatRuntimeEnvironment,
  name: string,
  address: string,
  constructorArgs?: unknown[]
): Promise<string> {
  const { network, config, ethers } = hre;

  const apiKey = (network.config as { verificationAPIKey?: string }).verificationAPIKey;
  if (!apiKey) {
    throw Error(
      `No Etherscan API key configured for network '${network.name}' (set 'verificationAPIKey' for it in ~/.hardhat/networks.json)`
    );
  }

  const chainConfig = await Etherscan.getCurrentChainConfig(
    network.name,
    network.provider,
    config.etherscan.customChains
  );
  const browserUrl = chainConfig.urls.browserURL.trim().replace(/\/$/, '');
  const etherscan = new Etherscan(apiKey, chainConfig.urls.apiURL, browserUrl, chainConfig.chainId);
  const contractUrl = etherscan.getContractUrl(address);

  if (await etherscan.isVerified(address)) {
    logger.info(`${name} at ${address} is already verified on Etherscan`);
    return contractUrl;
  }

  const deployedBytecode = await Bytecode.getDeployedContractBytecode(address, network.provider, network.name);

  let buildInfos: BuildInfo[];
  try {
    buildInfos = [task.buildInfo(name)];
  } catch {
    buildInfos = task.buildInfos();
  }
  const buildInfo = findBuildInfoWithContract(buildInfos, name);

  const sourceName = findContractSourceName(buildInfo, name);
  const fullSourceName = `${sourceName}:${name}`;

  const contractInformation = await extractMatchingContractInformation(fullSourceName, buildInfo, deployedBytecode);
  if (!contractInformation) throw Error('Could not find a bytecode matching the requested contract');

  const compilerInput = pruneToContractSources(buildInfo.input, contractInformation.contractOutput);

  let constructorArguments = '';
  if (constructorArgs !== undefined) {
    constructorArguments = new ethers.Interface(contractInformation.contractOutput.abi)
      .encodeDeploy(constructorArgs)
      .replace(/^0x/, '');
  } else {
    // Contracts deployed internally by another contract's constructor (e.g. TimelockAuthorizer's
    // TimelockExecutionHelper) have no entry in `/deployment-txs`, since there is no top-level transaction for them.
    // That's fine as long as they don't actually take constructor arguments, so we only require a deployment
    // transaction when the ABI says the constructor needs one.
    const constructorAbi = (contractInformation.contractOutput.abi as Array<{ type: string; inputs?: unknown[] }>).find(
      (entry) => entry.type === 'constructor'
    );

    if (constructorAbi !== undefined && (constructorAbi.inputs?.length ?? 0) > 0) {
      const deploymentTxHash = getContractDeploymentTransactionHash(address, task.network as Network);
      const deploymentTx = await ethers.provider.getTransaction(deploymentTxHash);
      if (!deploymentTx) {
        throw Error(`Could not find deployment transaction ${deploymentTxHash} for ${name} at ${address}`);
      }

      const creationBytecodeLength = task.artifact(name).bytecode.length;
      constructorArguments = deploymentTx.data.slice(creationBytecodeLength);
    }
  }

  logger.info(`Submitting ${name} at ${address} to Etherscan...`);

  try {
    const { message: guid } = await etherscan.verify(
      address,
      JSON.stringify(compilerInput),
      fullSourceName,
      `v${contractInformation.solcLongVersion}`,
      constructorArguments
    );

    const status = await etherscan.getVerificationStatus(guid);

    if (status.isAlreadyVerified()) {
      logger.info(`${name} at ${address} was already verified on Etherscan`);
      return contractUrl;
    }

    if (!status.isSuccess()) {
      throw Error(`Etherscan verification failed: ${status.message}`);
    }
  } catch (error) {
    if (!(error instanceof ContractAlreadyVerifiedError)) throw error;
  }

  return contractUrl;
}

/**
 * Restricts a standard-json input to the sources the given contract actually depends on.
 *
 * A task's build info covers an entire workspace, so its input carries far more sources than any single contract
 * needs. The contract's own solc metadata lists exactly the sources its compilation used, so keeping only those
 * yields a much smaller input that still recompiles to identical bytecode.
 */
function pruneToContractSources(input: CompilerInput, contractOutput: CompilerOutputContract): CompilerInput {
  // Hardhat's `CompilerOutputContract` type omits `metadata`, which solc emits whenever it is selected as an output.
  const { metadata } = contractOutput as CompilerOutputContract & { metadata?: string };
  if (metadata === undefined) return input;

  const dependencies = new Set(Object.keys((JSON.parse(metadata) as { sources: Record<string, unknown> }).sources));

  return {
    ...input,
    sources: Object.fromEntries(Object.entries(input.sources).filter(([sourceName]) => dependencies.has(sourceName))),
  };
}

function findBuildInfoWithContract(buildInfos: BuildInfo[], contractName: string): BuildInfo {
  const found = buildInfos.find((buildInfo) =>
    Object.values(buildInfo.output.contracts).some((contracts) => contractName in contracts)
  );

  if (found === undefined) {
    throw Error(`Could not find a build info for contract ${contractName}`);
  }

  return found;
}
