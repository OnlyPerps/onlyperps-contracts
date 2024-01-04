import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";
import { WNT, ExchangeRouter, MintableToken } from "../typechain-types";
import { fetchRealtimeFeedReportV2 } from "../utils/realtimeFeed";
const { ethers } = hre;

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("wallet address", wallet.address);
  const weth: MintableToken = await ethers.getContract("WETH");
  const wbtc: MintableToken = await ethers.getContract("WBTC");
  const usdc: MintableToken = await ethers.getContract("USDC");
  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");
  const oracle = await ethers.getContract("Oracle");
  const dataStore = await ethers.getContract("DataStore");
  const wethUsdMarketAddress = await getMarketTokenAddress(
    weth.address,
    weth.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ETH_FEED_ID = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";
  const BTC_FEED_ID = "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
  const USDC_FEED_ID = "0x0003dc85e8b01946bf9dfd8b0db860129181eb6105a8c8981d9f28e00b6f60d9";

  const timestamp = Math.floor(Date.now() / 1000);
  const clientId = process.env.REALTIME_FEED_CLIENT_ID;
  const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;
  let feedId = ETH_FEED_ID;
  const ethReport = await fetchRealtimeFeedReportV2({ feedId, timestamp, clientId, clientSecret });
  feedId = USDC_FEED_ID;
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

  const depositOrderKey = "0x0ebde1180b31b148cf73792d82b561187fd83b90bd8ee181489668b174dd6c0f";

  const depositHandler = await ethers.getContract("DepositHandler");
  const tx = await depositHandler.executeDeposit(depositOrderKey, params);
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
