import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GovToken",
  dependencyNames: ["RoleStore"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts.RoleStore.address, // roleStore
      "GMX DAO", // name
      "GMX_DAO", // symbol
      18, // decimals
    ];
  },
});

export default func;
