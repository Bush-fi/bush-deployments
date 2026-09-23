import { Contract, ZeroAddress } from 'ethers';

import logger from '../../../src/logger';
import { getSigner, Task, TaskMode, TaskRunOptions } from '@src';
import { ContractRegistration, ContractType, HookMode, RegistryInitializerDeployment } from './input';

const REGISTRY_TASK_NAME = '20260923-v3-contract-registry-v2';

export default async (task: Task, { from }: TaskRunOptions = {}): Promise<void> => {
  // This task sends transactions instead of deploying contracts, so there is nothing to check or verify.
  if (task.mode !== TaskMode.LIVE && task.mode !== TaskMode.TEST) {
    return;
  }

  const input = task.input() as RegistryInitializerDeployment;

  // Input mistakes are caught before any transaction is sent, rather than partway through the list.
  input.Registrations.forEach(validateRegistration);

  // The registry is read from its own task rather than taken as an input, so that this works both against the live
  // deployment and against one deployed inside a fork test, which saves to a different output file.
  const registryTask = new Task(
    REGISTRY_TASK_NAME,
    task.mode === TaskMode.TEST ? TaskMode.TEST : TaskMode.READ_ONLY,
    task.network
  );
  const registry = await registryTask.deployedInstance('BushContractRegistry');

  const sender = from ?? (await getSigner());
  const registryAsSender = registry.connect(sender) as Contract;

  // Both registry functions are `authenticate`, so they go through whichever Authorizer the Vault currently points
  // at: the `BootstrapAuthorizer`, which answers for its owner alone, or the `TimelockAuthorizer` and its explicit
  // grants once the handover has happened. Checking up front avoids a bare revert partway through the list.
  const authorizer = new Contract(
    await registry.getAuthorizer(),
    ['function canPerform(bytes32, address, address) view returns (bool)'],
    sender
  );

  const registryAddress = registry.target.toString();

  // Pool factories and everything else go through different registry functions, each with its own permission.
  const requiredActions: string[] = [];
  if (input.Registrations.some((registration) => registration.contractType !== ContractType.POOL_FACTORY)) {
    requiredActions.push('registerBushContract(uint8,string,address)');
  }
  if (input.Registrations.some((registration) => registration.contractType === ContractType.POOL_FACTORY)) {
    requiredActions.push('registerPoolFactory(string,address,string,uint8,address)');
  }
  if (input.Registrations.some((registration) => registration.contractAlias !== undefined)) {
    requiredActions.push('addOrUpdateBushContractAlias(string,address)');
  }

  for (const signature of requiredActions) {
    // Action IDs are disambiguated by the contract's own address, so they're read from the registry itself rather
    // than from the saved action IDs, which only describe the live deployment.
    const actionId = await registry.getActionId(registry.interface.getFunction(signature)!.selector);
    if (!(await authorizer.canPerform(actionId, sender.address, registryAddress))) {
      throw Error(
        `Sender ${sender.address} has no permission for ${signature} (action ${actionId}) on the registry at ` +
          `${registryAddress}, according to the Authorizer the Vault currently points at.`
      );
    }
  }

  for (const { contractType, name, address, contractAlias, poolFactory } of input.Registrations) {
    // `registerBushContract` reverts on an address that is already registered, so a re-run has to skip it rather
    // than retry. `isRegistered` stays true for deprecated contracts, which is what we want: re-registering one
    // would revert too.
    const info = await registry.getBushContractInfo(address);

    if (info.isRegistered) {
      if (info.contractType !== BigInt(contractType)) {
        throw Error(
          `${name} at ${address} is already registered as type ${info.contractType}, not ${contractType}. ` +
            `An address can only have one type, so this must be resolved manually.`
        );
      }

      if (poolFactory !== undefined) {
        // Pool factory metadata can't be edited in place either, so a mismatch also needs a manual fix
        // (deregister, then re-run).
        const factoryInfo = await registry.getPoolFactoryInfo(address);
        const hook = poolFactory.hook ?? ZeroAddress;
        if (
          factoryInfo.poolType !== poolFactory.poolType ||
          factoryInfo.hookMode !== BigInt(poolFactory.hookMode) ||
          factoryInfo.hook.toLowerCase() !== hook.toLowerCase()
        ) {
          throw Error(
            `${name} at ${address} is already registered as a ${factoryInfo.poolType} factory with hook mode ` +
              `${factoryInfo.hookMode} and hook ${factoryInfo.hook}, not a ${poolFactory.poolType} factory with ` +
              `hook mode ${poolFactory.hookMode} and hook ${hook}. This must be resolved manually.`
          );
        }
      }

      logger.info(`Already registered: ${name} at ${address}`);
    } else if (poolFactory !== undefined) {
      // The registry rejects pool factories in `registerBushContract`, so that every one has its metadata.
      await registryAsSender.registerPoolFactory(
        name,
        address,
        poolFactory.poolType,
        poolFactory.hookMode,
        poolFactory.hook ?? ZeroAddress
      );
      logger.success(`Registered pool factory: ${name} (${poolFactory.poolType}) at ${address}`);
    } else {
      await registryAsSender.registerBushContract(contractType, name, address);
      logger.success(`Registered: ${name} at ${address}`);
    }

    if (contractAlias === undefined) {
      continue;
    }

    // Unlike registration, aliases are meant to be re-pointed, so `addOrUpdateBushContractAlias` does not revert on
    // an existing one. Skipping when it already resolves keeps a re-run from sending a pointless transaction.
    // `getBushContract` only returns an address when the stored type matches, so a stale alias of another type
    // reads as unset here and gets re-pointed.
    const [aliasTarget] = await registry.getBushContract(contractType, contractAlias);
    if (aliasTarget.toLowerCase() === address.toLowerCase()) {
      logger.info(`Alias already set: ${contractAlias} -> ${name}`);
      continue;
    }

    await registryAsSender.addOrUpdateBushContractAlias(contractAlias, address);
    logger.success(`Aliased: ${contractAlias} -> ${name}`);
  }
};

function validateRegistration({ contractType, name, poolFactory }: ContractRegistration): void {
  if (contractType !== ContractType.POOL_FACTORY) {
    if (poolFactory !== undefined) {
      throw Error(`${name} has pool factory metadata, but is not registered as a pool factory.`);
    }
    return;
  }

  if (poolFactory === undefined) {
    throw Error(`${name} is a pool factory, so it needs pool factory metadata for \`registerPoolFactory\`.`);
  }

  if (poolFactory.poolType === '') {
    throw Error(`${name} has an empty pool type.`);
  }

  // The registry stores a hook only for factories that always attach the same one, and reverts otherwise.
  if ((poolFactory.hookMode === HookMode.SPECIFIC) !== (poolFactory.hook !== undefined)) {
    throw Error(`${name} must have a hook if and only if its hook mode is SPECIFIC.`);
  }
}
