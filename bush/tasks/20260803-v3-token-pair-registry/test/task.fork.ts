import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { describeForkTest, getForkedNetwork, getSigner, impersonate, Task, TaskMode } from '@src';
import { fp } from '@helpers/numbers';
import { BushContracts, createInitializedWeightedPool, deployWrappedToken, loadBushContracts } from '@helpers/bushFork';
import { TokenPairRegistryDeployment } from '../input';

describeForkTest('V3-TokenPairRegistry', 'robinhoodchain', 'latest', function () {
  const TASK_NAME = '20260803-v3-token-pair-registry';
  const CONTRACT_NAME = 'TokenPairRegistry';

  let task: Task;
  let input: TokenPairRegistryDeployment;
  let contracts: BushContracts;
  let tokenPairRegistry: Contract, pool: Contract, wrappedTest: Contract;
  let owner: SignerWithAddress;

  let WETH: string, TEST: string, wTEST: string;

  before('run task', async () => {
    task = new Task(TASK_NAME, TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });

    input = task.input() as TokenPairRegistryDeployment;
    tokenPairRegistry = await task.deployedInstance(CONTRACT_NAME);

    contracts = await loadBushContracts();
    owner = await impersonate(input.InitialOwner, fp(100));

    WETH = contracts.weth.target.toString();
    TEST = contracts.testToken.target.toString();
  });

  before('create pool and wrapped token', async () => {
    const lp = await getSigner(1);

    // A seeded WETH/TEST pool, and a wrapped TEST with an initialized buffer, to register paths through.
    pool = await createInitializedWeightedPool(contracts, lp);
    wrappedTest = await deployWrappedToken(contracts, contracts.testToken, lp, fp(100));
    wTEST = wrappedTest.target.toString();
  });

  it('checks owner and vault', async () => {
    expect(await tokenPairRegistry.owner()).to.equal(input.InitialOwner);
    expect(await tokenPairRegistry.vault()).to.equal(input.Vault);
  });

  it('starts empty', async () => {
    expect(await tokenPairRegistry.getPathCount(WETH, TEST)).to.equal(0);
    expect(await tokenPairRegistry.getPaths(WETH, TEST)).to.deep.equal([]);
  });

  it('only lets the owner add paths', async () => {
    const other = await getSigner(2);

    await expect(
      (tokenPairRegistry.connect(other) as Contract).addSimplePath(pool.target.toString())
    ).to.be.revertedWithCustomError(tokenPairRegistry, 'SenderNotAllowed');
  });

  it('sets a pool path in both directions', async () => {
    await (tokenPairRegistry.connect(owner) as Contract).addSimplePath(pool.target.toString());

    const toTest = [{ pool: pool.target.toString(), tokenOut: TEST, isBuffer: false }].map((o) => Object.values(o));
    const toWeth = [{ pool: pool.target.toString(), tokenOut: WETH, isBuffer: false }].map((o) => Object.values(o));

    expect(await tokenPairRegistry.getPaths(WETH, TEST)).to.deep.equal([toTest]);
    expect(await tokenPairRegistry.getPaths(TEST, WETH)).to.deep.equal([toWeth]);
  });

  it('sets a buffer path in both directions', async () => {
    await (tokenPairRegistry.connect(owner) as Contract).addSimplePath(wTEST);

    const wrapPath = [{ pool: wTEST, tokenOut: wTEST, isBuffer: true }].map((o) => Object.values(o));
    const unwrapPath = [{ pool: wTEST, tokenOut: TEST, isBuffer: true }].map((o) => Object.values(o));

    expect(await tokenPairRegistry.getPaths(TEST, wTEST)).to.deep.equal([wrapPath]);
    expect(await tokenPairRegistry.getPaths(wTEST, TEST)).to.deep.equal([unwrapPath]);
  });

  it('rejects a simple path that is neither a pool nor an initialized buffer', async () => {
    await expect((tokenPairRegistry.connect(owner) as Contract).addSimplePath(WETH)).to.be.revertedWithCustomError(
      tokenPairRegistry,
      'InvalidSimplePath'
    );
  });

  it('sets a multi-step path (WETH -> TEST -> wTEST)', async () => {
    const path = [
      { pool: pool.target.toString(), tokenOut: TEST, isBuffer: false },
      { pool: wTEST, tokenOut: wTEST, isBuffer: true },
    ];

    await (tokenPairRegistry.connect(owner) as Contract).addPath(WETH, path);

    expect(await tokenPairRegistry.getPaths(WETH, wTEST)).to.deep.equal([path.map((o) => Object.values(o))]);
    expect(await tokenPairRegistry.getPathCount(WETH, wTEST)).to.equal(1);
  });

  it('removes paths', async () => {
    await (tokenPairRegistry.connect(owner) as Contract).removePathAtIndex(WETH, wTEST, 0);
    expect(await tokenPairRegistry.getPathCount(WETH, wTEST)).to.equal(0);

    await (tokenPairRegistry.connect(owner) as Contract).removeSimplePath(pool.target.toString());
    expect(await tokenPairRegistry.getPathCount(WETH, TEST)).to.equal(0);
    expect(await tokenPairRegistry.getPathCount(TEST, WETH)).to.equal(0);
  });
});
