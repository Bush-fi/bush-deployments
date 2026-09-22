import axios from 'axios';
import { BuildInfo, CompilerInput, CompilerOutputContract, HardhatRuntimeEnvironment } from 'hardhat/types';

import Task from './task';
import { findContractSourceName } from './buildinfo';
import { Blockscout } from '@nomicfoundation/hardhat-verify/internal/blockscout';
import { extractMatchingContractInformation } from '@nomicfoundation/hardhat-verify/internal/solc/artifacts';
import { Bytecode } from '@nomicfoundation/hardhat-verify/internal/solc/bytecode';
import { sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';
import logger from './logger';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 24; // 2 minutes

// Blockscout's API rate limits aggressively, so requests are retried with an exponential backoff.
const MAX_REQUEST_ATTEMPTS = 6;
const REQUEST_BACKOFF_MS = 5000;

// Blockscout instances commonly sit behind a bot filter that answers requests without browser-like headers with an
// HTML challenge page instead of JSON, which is why we don't use the Blockscout class' own HTTP methods below. A
// user agent alone is not enough for Cloudflare's managed challenge: the request also has to look like the
// explorer's own front end, i.e. carry the same Accept, Accept-Language, Origin and Referer headers.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function browserHeaders(browserUrl: string): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: browserUrl,
    Referer: `${browserUrl}/`,
  };
}

// Every contract in this repository is published under the same license as the repository itself.
const LICENSE_TYPE = 'gnu_gpl_v3';

type SmartContractResponse = { name?: string; is_fully_verified?: boolean };

/**
 * Verifies a deployed contract on the current network's Blockscout instance (e.g.
 * https://robinhoodchain.blockscout.com), by submitting the task's `build-info` standard-json-input. The
 * `blockscout.customChains` entry matching the network's chain ID provides the API and browser URLs.
 *
 * Note that the stock `hardhat verify` task cannot be used in this repository: it verifies against the project's
 * compiled sources, and the deployed contracts' sources are not checked in - only their build info is. So, as in
 * `verifyOnSourcify`, we submit the standard-json-input that solc was given at deploy time.
 *
 * This uses Blockscout's native v2 API rather than its Etherscan-compatible `verifysourcecode` shim: the shim reports
 * "Smart-contract already verified" for contracts that are not in fact verified, which makes success indistinguishable
 * from failure. The v2 endpoint also takes the input as a file upload, so a large standard-json input doesn't blow
 * past the request size limit the way a form-encoded one does. Constructor arguments are auto-detected from the
 * creation code, which matters for contracts deployed by a factory rather than by a transaction of their own.
 */
export async function verifyOnBlockscout(
  task: Task,
  hre: HardhatRuntimeEnvironment,
  name: string,
  address: string
): Promise<string> {
  const { network, config } = hre;

  const chainConfig = await Blockscout.getCurrentChainConfig(
    network.name,
    network.provider,
    config.blockscout.customChains
  );
  const browserUrl = chainConfig.urls.browserURL.trim().replace(/\/$/, '');
  const contractUrl = `${browserUrl}/address/${address}?tab=contract`;
  const contractApiUrl = `${chainConfig.urls.apiURL.trim().replace(/\/$/, '')}/v2/smart-contracts/${address}`;

  const headers = browserHeaders(browserUrl);

  if (await isVerified(contractApiUrl, headers)) {
    logger.info(`${name} at ${address} is already verified on Blockscout`);
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

  logger.info(`Submitting ${name} at ${address} to ${contractApiUrl}...`);

  const form = new FormData();
  form.append('compiler_version', `v${contractInformation.solcLongVersion}`);
  form.append('contract_name', fullSourceName);
  form.append('autodetect_constructor_args', 'true');
  form.append('license_type', LICENSE_TYPE);
  form.append('files[0]', new Blob([JSON.stringify(compilerInput)], { type: 'application/json' }), 'input.json');

  await request(async () => {
    const { data } = await axios.post<{ message: string }>(`${contractApiUrl}/verification/via/standard-input`, form, {
      headers,
    });
    return data;
  });

  // Verification is asynchronous, and Blockscout exposes no job handle for it: the contract simply starts reporting
  // itself as verified once the compilation matches.
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    if (await isVerified(contractApiUrl, headers)) return contractUrl;
  }

  throw Error(`Timed out waiting for Blockscout to verify ${name} at ${address}. See ${contractUrl} for its status.`);
}

async function isVerified(contractApiUrl: string, headers: Record<string, string>): Promise<boolean> {
  // An unverified contract still resolves, but its response carries only bytecode, with no verification fields.
  const contract = await request<SmartContractResponse>(async () => {
    const { data } = await axios.get<SmartContractResponse>(contractApiUrl, { headers });
    return data;
  });

  return contract.name !== undefined;
}

async function request<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      const isRateLimited = axios.isAxiosError(error) && error.response?.status === 429;

      if (!isRateLimited || attempt === MAX_REQUEST_ATTEMPTS - 1) {
        throw asBlockscoutError(error);
      }

      const delay = REQUEST_BACKOFF_MS * 2 ** attempt;
      logger.warn(`Rate limited by Blockscout, retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

function asBlockscoutError(error: unknown): Error {
  if (axios.isAxiosError(error) && error.response) {
    return Error(`Blockscout request failed (${error.response.status}): ${JSON.stringify(error.response.data)}`);
  }
  return error instanceof Error ? error : Error(String(error));
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
