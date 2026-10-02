export type RootChangeDeployment = {
  // The account that will become root of the TimelockAuthorizer once it calls `claimRoot`.
  NewRoot: string;
};


const NewRoot = '0xEF39548241ABb0B8B072BD2C0ce25BB5A326009F';

export default {
  robinhoodchain: {
    NewRoot,
  },
};
