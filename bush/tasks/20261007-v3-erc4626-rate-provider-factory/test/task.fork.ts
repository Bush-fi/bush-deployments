import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';

import { describeForkTest, getForkedNetwork, Task, TaskMode } from '@src';
import { ZERO_ADDRESS } from '@helpers/constants';

describeForkTest('V3-ERC4626RateProviderFactory', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20261007-v3-erc4626-rate-provider-factory';
  const FACTORY_CONTRACT_NAME = 'ERC4626RateProviderFactory';

  let task: Task;
  let factory: Contract;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance(FACTORY_CONTRACT_NAME);
  });

  it('does not recognize rate providers it did not create', async () => {
    expect(await factory.isRateProviderFromFactory(ZERO_ADDRESS)).to.be.false;
  });
});
