import hre from 'hardhat';

import { HttpNetworkConfig, HardhatNetworkConfig } from 'hardhat/types';
import { JsonRpcProvider } from 'ethers';
import { Network } from './types';

// A concrete block to fork from, or `'latest'` to resolve one at runtime. The public Robinhood Chain RPC is not
// archival and prunes state within minutes, so forking from a hardcoded block quickly fails with "historical state
// is not available"; tests against it fork from a block close to the head instead.
export type ForkBlock = number | 'latest';

// Blocks behind the head to fork from when resolving `'latest'`, so that a reorg or a lagging RPC node doesn't
// leave the fork pointing at a block the node no longer serves.
const LATEST_BLOCK_LAG = 5;

export function describeForkTest(
  name: string,
  forkNetwork: Network,
  blockNumber: ForkBlock,
  callback: () => void
): void {
  describe(name, () => {
    _describeBody(forkNetwork, blockNumber, callback);
  });
}

describeForkTest.only = function (
  name: string,
  forkNetwork: Network,
  blockNumber: ForkBlock,
  callback: () => void
): void {
  // eslint-disable-next-line mocha-no-only/mocha-no-only
  describe.only(name, () => {
    _describeBody(forkNetwork, blockNumber, callback);
  });
};

describeForkTest.skip = function (
  name: string,
  forkNetwork: Network,
  blockNumber: ForkBlock,
  callback: () => void
): void {
  describe.skip(name, () => {
    _describeBody(forkNetwork, blockNumber, callback);
  });
};

function _describeBody(forkNetwork: Network, forkBlock: ForkBlock, callback: () => void) {
  before('setup fork test', async () => {
    const forkingNetworkName = Object.keys(hre.config.networks).find((networkName) => networkName === forkNetwork);
    if (!forkingNetworkName) throw Error(`Could not find a config for network ${forkNetwork} to be forked`);

    const forkingNetworkConfig = hre.config.networks[forkingNetworkName] as HttpNetworkConfig;
    if (!forkingNetworkConfig.url) throw Error(`Could not find a RPC url in network config for ${forkingNetworkName}`);

    const blockNumber =
      forkBlock === 'latest'
        ? (await new JsonRpcProvider(forkingNetworkConfig.url).getBlockNumber()) - LATEST_BLOCK_LAG
        : forkBlock;

    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [{ forking: { jsonRpcUrl: forkingNetworkConfig.url, blockNumber } }],
    });
    // Force it back to 0 immediately to prevent "maxFeePerGas too low" errors.
    await hre.network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);
    // Hardhat executes calls at the fork block itself as "historical", which needs a hardfork history it only has
    // for well-known chains: on Robinhood Chain every call fails with "No known hardfork" until a local block exists.
    // Mining one right away moves `latest` past the fork block, so everything runs with the node's own hardfork.
    await hre.network.provider.send('evm_mine', []);

    const config = hre.network.config as HardhatNetworkConfig;
    config.forking = { enabled: true, blockNumber, url: forkingNetworkConfig.url, httpHeaders: {} };
  });
  callback();
}
