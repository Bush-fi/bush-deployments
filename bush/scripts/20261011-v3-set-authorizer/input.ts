import { Task, TaskMode } from '@src';

export type SetAuthorizerDeployment = {
  Vault: string;
  // The account that must hold `setAuthorizer` on the new Authorizer before the switch, so that the Vault can still be
  // pointed somewhere else afterwards.
  Admin: string;
};

const Vault = new Task('20260730-v3-vault3', TaskMode.READ_ONLY);

// The admin Safe, which receives every permission granted by `20260827-v3-grant-permissions`.
const Admin = '0xEF39548241ABb0B8B072BD2C0ce25BB5A326009F';

export default {
  Vault,
  robinhoodchain: {
    Admin,
  },
};
