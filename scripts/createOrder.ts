import hre from "hardhat";

import { FLOAT_PRECISION, expandDecimals, decimalToFloat, formatAmount } from "../utils/math";
import { OrderType, DecreasePositionSwapType } from "../utils/order";
import { fetchRealtimeFeedReportV2 } from "../utils/realtimeFeed";
import { contractAt } from "../utils/deploy";

// INSTRUCTIONS TO RUN
//
// create a new wallet account
//
// create a key-file.json at keys/key-file.json, with content:
// {
//  "address": "<your account address>",
//  "key": "<your account private key>"
// }
//
// then run:
//
// REALTIME_FEED_CLIENT_ID=<clien-id> REALTIME_FEED_CLIENT_SECRET=<client-secret> ACCOUNT_KEY_FILE=key-file.json npx hardhat run --network arbitrumGoerli scripts/createOrder.ts
//
// after running the script the position should be viewable on
// https://chainlink-workshop.gmx-interface.pages.dev/#/actions/v2/<your account address>
// note that the network should be switched to the network that the txn was sent on

// additional information about parameters:
// https://docs.gmx.io/docs/api/contracts-v2#exchangerouter
async function createOrder({
  router, // the router instance
  exchangeRouter, // the exchangeRouter instance
  receiver, // the receiver of any output tokens
  referralCode, // the referralCode (https://docs.gmx.io/docs/referrals)
  market, // the address of the market
  initialCollateralToken, // the collateral token being sent
  initialCollateralDeltaAmount, // the amount of collateral token being sent
  sizeDeltaUsd, // the size of the position
  triggerPrice, // the price at which the order should be triggerred
  acceptablePrice, // the acceptable price at which the order should be executed
  isLong, // whether to open a long or short position
  orderType, // whether this is a market, limit, increase, decrease, swap order
  decreasePositionSwapType, // the swap type for output tokens when decreasing a position
}) {
  const { AddressZero } = ethers.constants;
  const orderVault = await hre.ethers.getContract("OrderVault");

  const signer = exchangeRouter.signer;

  const collateralToken = await contractAt("MintableToken", initialCollateralToken, signer);
  const approvedAmount = await collateralToken.allowance(signer.address, router.address);
  if (approvedAmount.lt(initialCollateralDeltaAmount)) {
    await collateralToken.approve(router.address, initialCollateralDeltaAmount);
  }

  const estimatedGasLimit = 8_000_000;
  const gasPrice = await signer.getGasPrice();
  const executionFee = gasPrice.mul(estimatedGasLimit);
  console.log("estimated execution fee", executionFee.toString());
  const orderParams = {
    addresses: {
      receiver,
      callbackContract: AddressZero,
      uiFeeReceiver: AddressZero,
      market,
      initialCollateralToken,
      swapPath: [],
    },
    numbers: {
      sizeDeltaUsd,
      initialCollateralDeltaAmount,
      triggerPrice,
      acceptablePrice,
      executionFee,
      callbackGasLimit: 0,
      minOutputAmount: initialCollateralDeltaAmount,
    },
    orderType,
    decreasePositionSwapType,
    isLong,
    shouldUnwrapNativeToken: false,
    referralCode,
  };
  // callstatic
  const multicallArgs = [
    // send WETH to the orderVault pay for the execution fee
    exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
    // send the collateral to the orderVault
    exchangeRouter.interface.encodeFunctionData("sendTokens", [
      initialCollateralToken,
      orderVault.address,
      initialCollateralDeltaAmount,
    ]),
    exchangeRouter.interface.encodeFunctionData("createOrder", [orderParams]),
  ];
  const txArgs = { value: executionFee };
  const returnValues = await exchangeRouter.callStatic.multicall(multicallArgs, txArgs);
  console.log("returnValues", returnValues);
  const tx = await exchangeRouter.multicall(multicallArgs, txArgs);

  return tx;
}

async function main() {
  if (hre.network.config.accounts.length === 0) {
    throw new Error("Empty account");
  }

  const router = await hre.ethers.getContract("Router");
  const exchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const receiver = exchangeRouter.signer.address;
  const referralCode = ethers.constants.HashZero;

  // a list of markets can be printed using scripts/printMarkets.ts
  const ETH_USD_MARKET = "0x586900162331108356eFF601C011858E2A5a57a1";

  // list of feed IDs can be found in config/tokens.ts
  const ETH_FEED_ID = "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782";

  // list of tokens can be found in config/tokens.ts
  const USDC = "0x37cce10bc138e364249f3441936b8c6038a3cdf6";

  const feedId = ETH_FEED_ID;
  // reduce the latest block by 10 to allow for some buffer since it may take some time for reports to be produced
  const timestamp = Math.floor(Date.now() / 1000) - 10;

  const clientId = process.env.REALTIME_FEED_CLIENT_ID;
  const clientSecret = process.env.REALTIME_FEED_CLIENT_SECRET;
  const report = await fetchRealtimeFeedReportV2({ feedId, timestamp, clientId, clientSecret });

  const chainlinkFeedPrecision = expandDecimals(1, 18);
  const isLong = false;
  const acceptableSlippage = isLong ? 30 : -30;
  const market = ETH_USD_MARKET;

  const currentPrice = report.report.report.price.mul(FLOAT_PRECISION).div(chainlinkFeedPrecision);
  console.log(`currentPrice: ${formatAmount(currentPrice, 30, 2, true)}`);

  // allow 30bps (0.3%) slippage
  // divide by 10^18 to get the price per unit of token
  const acceptablePrice = currentPrice
    .mul(10_000 + acceptableSlippage)
    .div(10_000)
    .div(expandDecimals(1, 18));

  const tx = await createOrder({
    router,
    exchangeRouter,
    receiver,
    referralCode,
    market,
    initialCollateralToken: USDC,
    initialCollateralDeltaAmount: expandDecimals(10, 6), // 10 USDC
    sizeDeltaUsd: decimalToFloat(100), // 100 USD
    triggerPrice: 0, // not needed for market order
    acceptablePrice,
    isLong: isLong,
    orderType: OrderType.MarketIncrease,
    decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
  });

  console.log(`tx sent: ${tx.hash}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
