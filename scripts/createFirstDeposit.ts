import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";

import { ExchangeRouter, MintableToken } from "../typechain-types";
import { DepositUtils } from "../typechain-types/contracts/exchange/DepositHandler";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers/lib/ethers";
import { parseUnits } from "ethers/lib/utils";

const { ethers } = hre;

async function getContracts(tokenSymbol: string) {
  const [marketFactory, roleStore, dataStore, depositVault, router, exchangeRouter, token, usdc] = await Promise.all([
    ethers.getContract("MarketFactory"),
    ethers.getContract("RoleStore"),
    ethers.getContract("DataStore"),
    ethers.getContract("DepositVault"),
    ethers.getContract("Router"),
    (await ethers.getContract("ExchangeRouter")) as ExchangeRouter,
    (await ethers.getContract(tokenSymbol)) as MintableToken,
    (await ethers.getContract("USDC")) as MintableToken,
  ]);

  const marketTokenAddress = await getMarketTokenAddress(
    token.address,
    token.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );

  return {
    depositVault,
    router,
    exchangeRouter,
    token,
    usdc,
    marketTokenAddress,
  };
}

async function ensureERC20Balance(wallet: SignerWithAddress, token: MintableToken, amount: BigNumber, spender: string) {
  const balance = await token.balanceOf(wallet.address);
  if (balance.lt(amount)) {
    console.log("minting %s %s", amount, token.address);
    await token.mint(wallet.address, amount);
  }
  const allowance = await token.allowance(wallet.address, spender);
  if (allowance.lt(amount)) {
    console.log("approving %s %s", amount, token.address);
    await token.approve(spender, bigNumberify(2).pow(256).sub(1));
  }
}

async function main() {
  const tokenSymbol = "LINK";
  const { depositVault, router, exchangeRouter, token, usdc, marketTokenAddress } = await getContracts(tokenSymbol);
  const [wallet] = await ethers.getSigners();
  const executionFee = expandDecimals(1, 15); // 0.001 WNT
  const longTokenAmount = expandDecimals(100000, 18); // 100000 xxx
  const shortTokenAmount = expandDecimals(1484000, 6); // 1484000 USDC
  const maxFeePerGas = parseUnits("0.001", "gwei");
  const maxPriorityFeePerGas = 1;

  await ensureERC20Balance(wallet, token, longTokenAmount, router.address);
  await ensureERC20Balance(wallet, usdc, shortTokenAmount, router.address);

  const params: DepositUtils.CreateDepositParamsStruct = {
    // receiver: "0x0000000000000000000000000000000000000001",
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    market: marketTokenAddress,
    minMarketTokens: 0,
    shouldUnwrapNativeToken: false,
    executionFee: executionFee,
    callbackGasLimit: 0,
    initialLongToken: token.address,
    longTokenSwapPath: [],
    initialShortToken: usdc.address,
    shortTokenSwapPath: [],
    uiFeeReceiver: ethers.constants.AddressZero,
  };

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [token.address, depositVault.address, longTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createDeposit", [params]),
  ];

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
  });
  console.log("transaction sent", tx.hash);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
