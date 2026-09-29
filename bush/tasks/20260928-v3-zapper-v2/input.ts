import { Task, TaskMode } from '@src';

export type LiquidityZapperDeployment = {
  Vault: string;
  Router: string;
  Permit2: string;
  UmbraRouter: string;
  KyberswapRouter: string;
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
    KyberswapRouter: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
  },
};
