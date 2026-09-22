import { Task, TaskMode } from '@src';

export type LiquidityZapperDeployment = {
  Vault: string;
  Router: string;
  Permit2: string;
  UmbraRouter: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);
const Router = new Task('20260801-v3-router', TaskMode.READ_ONLY);
const Permit2 = new Task('00000000-permit2', TaskMode.READ_ONLY);

export default {
  Vault,
  Router,
  Permit2,
  robinhoodchain: {
    UmbraRouter: '0xfC830D7861C5ceBefF2272a03aacEf9baC8A7603',
  },
};
