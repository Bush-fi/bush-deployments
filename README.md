# <img src="bushLogo.png" alt="Bush" height="128px">

# Bush V3 Deployments

This repository contains the addresses, ABIs and deployment scripts of the Bush V3 contracts deployed on Robinhood Chain. Each deployment consists of a deployment script (called 'task'), inputs (script configuration, such as dependencies), outputs (contract addresses), and the ABIs and bytecode files of the related contracts.

Addresses and ABIs can be consumed from the package in JavaScript environments, or manually retrieved from the `bush/tasks/<task-id>` directories.

Note that some protocol contracts are created dynamically: for example, `WeightedPool` contracts are deployed by the canonical `WeightedPoolFactory`. While the ABIs of these contracts are stored in the `artifact` directory of each deployment, their addresses are not. Those can be retrieved by querying the on-chain state or processing emitted events.

## Overview

### Deploying Contracts

For more information on how to create new deployments or run existing ones in new networks, head to the [deployment guide](DEPLOYING.md).

### Installation

```console
$ npm install @bush.fi/v3-deployments
```

### Usage

Import `@bush.fi/v3-deployments` to access the different ABIs and deployed addresses. To see all current Task IDs and their associated contracts, head to [Active Deployments](#active-deployments).

Past deployments that are currently not in use or have been superseded can be accessed in the [Deprecated Deployments](#deprecated-deployments) section. Use `deprecated/` as prefix when referring to a deprecated task ID.

> ⚠️ Exercise care when interacting with deprecated deployments: there's often a very good reason why they're no longer active.
>
> You can find information on why each deployment has been deprecated in their corresponding readme file.

---

- **async function getBushContract(taskID, contract, network)**

Returns an [Ethers](https://docs.ethers.io/v5/) contract object for a canonical deployment (e.g. the Vault, or a Pool factory).

_Note: requires using [Hardhat](https://hardhat.org/) with the [`hardhat-ethers`](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-ethers) plugin._

- **async function getBushContractAt(taskID, contract, address)**

Returns an [Ethers](https://docs.ethers.io/v5/) contract object for a contract dynamically created at a known address (e.g. a Pool created from a factory).

_Note: requires using [Hardhat](https://hardhat.org/) with the [`hardhat-ethers`](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-ethers) plugin._

- **function getBushContractAbi(taskID, contract)**

Returns a contract's [ABI](https://docs.soliditylang.org/en/latest/abi-spec.html).

- **function getBushContractBytecode(taskID, contract)**

Returns a contract's [creation code](https://docs.soliditylang.org/en/latest/contracts.html#creating-contracts).

- **function getBushContractAddress(taskID, contract, network)**

Returns the address of a contract's canonical deployment.

- **function getBushDeployment(taskID, network)**

Returns an object with all contracts from a deployment and their addresses.

## Active Deployments

| Description                                  | Task ID                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Permit2 (canonical singleton)                | [`00000000-permit2`](./bush/tasks/00000000-permit2)                                                     |
| Wrapped native token                         | [`000000001-tokens`](./bush/tasks/000000001-tokens)                                                     |
| Bootstrap Authorizer                         | [`20260730-v3-bootstrap-authorizer`](./bush/tasks/20260730-v3-bootstrap-authorizer)                     |
| V3 Protocol Fee Controller                   | [`20260730-v3-protocol-fee-controller`](./bush/tasks/20260730-v3-protocol-fee-controller)               |
| V3 Vault artifacts (Vault, Extension, Admin) | [`20260730-v3-vault3`](./bush/tasks/20260730-v3-vault3)                                                 |
| V3 Vault Factory, and Vault contracts        | [`20260730-v3-vault-factory`](./bush/tasks/20260730-v3-vault-factory)                                   |
| V3 Batch Router                              | [`20260801-v3-batch-router`](./bush/tasks/20260801-v3-batch-router)                                     |
| V3 Buffer Router                             | [`20260801-v3-buffer-router`](./bush/tasks/20260801-v3-buffer-router)                                   |
| V3 Composite Liquidity Router                | [`20260801-v3-composite-liquidity-router-v2`](./bush/tasks/20260801-v3-composite-liquidity-router-v2)   |
| V3 Router                                    | [`20260801-v3-router`](./bush/tasks/20260801-v3-router)                                                 |
| V3 Contract Registry                         | [`20260802-v3-contract-registry`](./bush/tasks/20260802-v3-contract-registry)                           |
| V3 Unbalanced Add via Swap Router            | [`20260802-v3-unbalanced-add-via-swap-router`](./bush/tasks/20260802-v3-unbalanced-add-via-swap-router) |
| V3 Stable Pool                               | [`20260803-v3-stable-pool`](./bush/tasks/20260803-v3-stable-pool)                                       |
| Test Token                                   | [`20260803-v3-test-token`](./bush/tasks/20260803-v3-test-token)                                         |
| V3 Token Pair Registry                       | [`20260803-v3-token-pair-registry`](./bush/tasks/20260803-v3-token-pair-registry)                       |
| V3 Weighted Pool                             | [`20260803-v3-weighted-pool`](./bush/tasks/20260803-v3-weighted-pool)                                   |
| V3 Aggregator Batch Router                   | [`20260815-v3-aggregator-batch-router`](./bush/tasks/20260815-v3-aggregator-batch-router)               |
| V3 Aggregator Router                         | [`20260815-v3-aggregator-router`](./bush/tasks/20260815-v3-aggregator-router)                           |
| V3 Protocol Fee Sweeper                      | [`20260827-v3-protocol-fee-sweeper-v2`](./bush/tasks/20260827-v3-protocol-fee-sweeper-v2)               |
| Timelock Authorizer, governance contract     | [`20260827-v3-timelock-authorizer`](./bush/tasks/20260827-v3-timelock-authorizer)                       |
| V3 Liquidity Zapper (Umbra)                  | [`20260917-v3-zapper`](./bush/tasks/20260917-v3-zapper)                                                 |
| V3 Pool Factory Registry                     | [`20260922-v3-pool-factory-registry`](./bush/tasks/20260922-v3-pool-factory-registry)                   |

## Scripts

These are deployments for script-like contracts (often called 'coordinators') which are typically granted some permission by Governance and then executed, after which they become useless.

| Description                                   | Task ID                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Grant initial Timelock Authorizer permissions | [`20260827-v3-grant-permissions`](./bush/scripts/20260827-v3-grant-permissions)       |
| Contract Registry Initializer                 | [`20260830-v3-registry-initializer`](./bush/scripts/20260830-v3-registry-initializer) |

## Deprecated Deployments

These deployments have been deprecated because they're either outdated and have been replaced by newer versions, or because they no longer form part of the current infrastructure. **In almost all cases they should no longer be used,** and are only kept here for historical reasons.

Go to each deprecated deployment's readme file to learn more about why it is deprecated, and what the replacement deployment is (if any).

_No deployments have been deprecated yet._
