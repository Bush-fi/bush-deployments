import axios from 'axios';
import { BuildInfo, Network } from 'hardhat/types';

import Task from './task';
import { findContractSourceName } from './buildinfo';
import { extractMatchingContractInformation } from '@nomicfoundation/hardhat-verify/internal/solc/artifacts';
import { Bytecode } from '@nomicfoundation/hardhat-verify/internal/solc/bytecode';
import { sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';
import logger from './logger';

const SOURCIFY_API_URL = 'https://sourcify.dev/server';
const SOURCIFY_BROWSER_URL = 'https://repo.sourcify.dev';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20; // 1 minute

type SubmitResponse = {
  verificationId: string;
};

type StatusResponse = {
  isJobCompleted: boolean;
  error?: { customCode: string; message: string };
  contract?: { match: 'match' | 'exact_match' | null };
};

/**
 * Verifies a deployed contract on Sourcify (https://sourcify.dev) via its v2 API, independent of the
 * Etherscan/Blockscout `Verifier` pipeline in `src/verifier.ts`. Sourcify's v1 `/verify` endpoint (single-shot,
 * metadata.json + source files) is in a scheduled brownout through 2027-01-08, so this uses v2's async job-based
 * flow instead: submit the standard-json-input directly (same shape as `buildInfo.input`, already used elsewhere
 * in this codebase), then poll for completion.
 */
export async function verifyOnSourcify(
  task: Task,
  network: Network,
  name: string,
  address: string,
  chainId: number
): Promise<string> {
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

  logger.info(`Submitting ${name} at ${address} to Sourcify...`);

  let submitResponse;
  try {
    submitResponse = await axios.post<SubmitResponse>(`${SOURCIFY_API_URL}/v2/verify/${chainId}/${address}`, {
      stdJsonInput: buildInfo.input,
      compilerVersion: contractInformation.solcLongVersion,
      contractIdentifier: fullSourceName,
    });
  } catch (error) {
    throw asSourcifyError(error, 'submission');
  }

  const { verificationId } = submitResponse.data;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    let statusResponse;
    try {
      statusResponse = await axios.get<StatusResponse>(`${SOURCIFY_API_URL}/v2/verify/${verificationId}`);
    } catch (error) {
      throw asSourcifyError(error, 'status check');
    }

    const { isJobCompleted, error, contract } = statusResponse.data;
    if (!isJobCompleted) continue;

    if (error) {
      throw Error(`Sourcify verification failed (${error.customCode}): ${error.message}`);
    }

    if (contract?.match === 'match' || contract?.match === 'exact_match') {
      const matchType = contract.match === 'exact_match' ? 'full_match' : 'partial_match';
      return `${SOURCIFY_BROWSER_URL}/contracts/${matchType}/${chainId}/${address}/`;
    }

    throw Error(`Sourcify job completed with an unexpected result: ${JSON.stringify(statusResponse.data)}`);
  }

  throw Error(`Timed out waiting for Sourcify to finish verifying ${name} (verificationId: ${verificationId})`);
}

function asSourcifyError(error: unknown, stage: string): Error {
  if (axios.isAxiosError(error) && error.response) {
    return Error(`Sourcify ${stage} failed (${error.response.status}): ${JSON.stringify(error.response.data)}`);
  }
  return error instanceof Error ? error : Error(String(error));
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
