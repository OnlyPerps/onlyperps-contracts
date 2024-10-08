import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GovTimelockController",
  getDeployArgs: async ({ getNamedAccounts }) => {
    const { deployer } = await getNamedAccounts();
    return [
      "GMX Gov Timelock Controller", // name
      24 * 60 * 60, // minDelay
      [deployer], // proposers
      [deployer], // executors
      deployer,
    ];
  },
});

export default func;
