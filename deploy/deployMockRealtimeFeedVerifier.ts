import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["MockFeeManager"];

const func = createDeployFunction({
  contractName: "MockRealtimeFeedVerifier",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
