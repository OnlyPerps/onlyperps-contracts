import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals, FLOAT_PRECISION, formatAmount } from "../utils/math";
import { WNT, ExchangeRouter, MintableToken } from "../typechain-types";
import { fetchRealtimeFeedReportV2 } from "../utils/realtimeFeed";
const { ethers } = hre;

async function getValues(): Promise<{
  wnt: WNT;
}> {
  if (hre.network.name === "avalancheFuji") {
    return {
      wnt: await ethers.getContractAt("WNT", "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3"),
    };
  } else if (hre.network.name === "localhost") {
    return {
      wnt: await ethers.getContract("WETH"),
    };
  } else if (hre.network.name == "arbitrumSepolia") {
    return {
      wnt: await ethers.getContractAt("WNT", "0xAdEa2d7f8F9e676E1B6DD49CEa8873E9A2302d1c"),
    };
  }

  throw new Error("unsupported network");
}

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("wallet address", wallet.address);
  const weth: MintableToken = await ethers.getContract("WETH");
  const usdc: MintableToken = await ethers.getContract("USDC");

  const ETH_FEED_ID = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
  const BTC_FEED_ID = "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
  const USDC_FEED_ID = "0x0003dc85e8b01946bf9dfd8b0db860129181eb6105a8c8981d9f28e00b6f60d9";

  const timestamp = Math.floor(Date.now() / 1000);
  const clientId = process.env.REALTIME_FEED_CLIENT_ID;
  const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;
  const chainlinkFeedPrecision = expandDecimals(1, 18);
  let feedId = ETH_FEED_ID;
  const ethReport = await fetchRealtimeFeedReportV2({ feedId, timestamp, clientId, clientSecret });
  feedId = USDC_FEED_ID;
  const currentPrice = ethReport.report.report.price.mul(FLOAT_PRECISION).div(chainlinkFeedPrecision);
  console.log(`currentPrice: ${formatAmount(currentPrice, 30, 2, true)}`);
  const usdcReport = await fetchRealtimeFeedReportV2({ feedId, timestamp, clientId, clientSecret });
  const params = {
    signerInfo: 0,
    tokens: [],
    compactedMinOracleBlockNumbers: [],
    compactedMaxOracleBlockNumbers: [],
    compactedOracleTimestamps: [],
    compactedDecimals: [],
    compactedMinPrices: [],
    compactedMinPricesIndexes: [],
    compactedMaxPrices: [],
    compactedMaxPricesIndexes: [],
    signatures: [],
    priceFeedTokens: [],
    realtimeFeedTokens: [usdc.address, weth.address],
    realtimeFeedData: [usdcReport.response.report.fullReport, ethReport.response.report.fullReport],
  };
  console.log("params", params);

  const orderKey = "0x4e8bcde102637fb3024934f489d5beb9a15f032249ad3bdd748119ff42b0af5b";
  const orderHandler = await ethers.getContract("OrderHandler");
  const tx = await orderHandler.executeOrder(orderKey, params);
  console.log("transaction sent", tx.hash);
  await tx.wait();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
