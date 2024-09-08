import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { bigNumberify } from "../utils/math";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { getFullKey, appendUintConfigIfDifferent } from "../utils/config";
import * as keys from "../utils/keys";

const processMarkets = async ({ markets, onchainMarketsByTokens, tokens, generalConfig, handleConfig }) => {
  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, true]),
      marketConfig.maxPnlFactorForAdlLongs,
      `maxPnlFactorForAdlLongs ${marketToken}`
    );

    await handleConfig(
      "uint",
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, false]),
      marketConfig.maxPnlFactorForAdlShorts,
      `maxPnlFactorForAdlShorts ${marketToken}`
    );

    await handleConfig(
      "uint",
      keys.MIN_PNL_FACTOR_AFTER_ADL,
      encodeData(["address", "bool"], [marketToken, true]),
      marketConfig.minPnlFactorAfterAdlLongs,
      `minPnlFactorAfterAdlLongs ${marketToken}`
    );

    await handleConfig(
      "uint",
      keys.MIN_PNL_FACTOR_AFTER_ADL,
      encodeData(["address", "bool"], [marketToken, false]),
      marketConfig.minPnlFactorAfterAdlShorts,
      `minPnlFactorAfterAdlShorts ${marketToken}`
    );
  }
};

async function main() {
  const { read } = hre.deployments;

  const generalConfig = await hre.gmx.getGeneral();
  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const keys = [];
  const multicallReadParams = [];
  console.log(onchainMarketsByTokens);

  await processMarkets({
    markets,
    onchainMarketsByTokens,
    tokens,
    generalConfig,
    handleConfig: async (type, baseKey, keyData) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      const key = getFullKey(baseKey, keyData);

      keys.push(key);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [key]),
      });
    },
  });

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const dataCache = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = result[i].returnData;
    dataCache[key] = bigNumberify(value);
  }

  console.log(dataCache);

  const multicallWriteParams = [];

  await processMarkets({
    markets,
    onchainMarketsByTokens,
    tokens,
    generalConfig,
    handleConfig: async (type, baseKey, keyData, value, label) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      await appendUintConfigIfDifferent(multicallWriteParams, dataCache, baseKey, keyData, value, label);
    },
  });

  console.log(`updating ${multicallWriteParams.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    const tx = await config.multicall(multicallWriteParams);
    console.log(`tx sent: ${tx.hash}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
