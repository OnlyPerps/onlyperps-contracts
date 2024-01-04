import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";

import { ExchangeRouter, MarketToken, MintableToken } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers/lib/ethers";
import { parseUnits } from "ethers/lib/utils";
import { TransactionResponse } from "@ethersproject/providers";
import { WithdrawalUtils } from "../typechain-types/contracts/exchange/IWithdrawalHandler";

const { ethers } = hre;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getContracts() {
  const [marketFactory, roleStore, dataStore, withdrawalVault, router, exchangeRouter, wbtc, usdc] = await Promise.all([
    ethers.getContract("MarketFactory"),
    ethers.getContract("RoleStore"),
    ethers.getContract("DataStore"),
    ethers.getContract("WithdrawalVault"),
    ethers.getContract("Router"),
    (await ethers.getContract("ExchangeRouter")) as ExchangeRouter,
    (await ethers.getContract("WBTC")) as MintableToken,
    (await ethers.getContract("USDC")) as MintableToken,
  ]);

  const wbtcUsdMarketAddress = await getMarketTokenAddress(
    wbtc.address,
    wbtc.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const wbtcUsdMarketToken = (await ethers.getContractAt("MarketToken", wbtcUsdMarketAddress)) as MarketToken;

  return {
    withdrawalVault,
    router,
    exchangeRouter,
    wbtcUsdMarketToken,
  };
}

async function ensureERC20Balance(wallet: SignerWithAddress, token: MintableToken, amount: BigNumber, spender: string) {
  const balance = await token.balanceOf(wallet.address);
  if (balance.lt(amount)) {
    throw new Error("insufficient balance");
  }
  const allowance = await token.allowance(wallet.address, spender);
  if (allowance.lt(amount)) {
    console.log("approving %s %s", amount, token.address);
    await token.approve(spender, bigNumberify(2).pow(256).sub(1));
  }
}

async function main() {
  const { withdrawalVault, router, exchangeRouter, wbtcUsdMarketToken } = await getContracts();
  const [wallet] = await ethers.getSigners();
  const executionFee = expandDecimals(1, 15); // 0.001 WNT
  const marketTokenAmount = expandDecimals(100, 18);
  const count = 60;
  const pauseBetweenTxs = 100;
  const gasLimit = 1100000;
  const maxFeePerGas = parseUnits("0.001", "gwei");
  const maxPriorityFeePerGas = 1;

  await ensureERC20Balance(wallet, wbtcUsdMarketToken, marketTokenAmount.mul(count), router.address);

  const params: WithdrawalUtils.CreateWithdrawalParamsStruct = {
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    uiFeeReceiver: ethers.constants.AddressZero,
    market: wbtcUsdMarketToken.address,
    longTokenSwapPath: [],
    shortTokenSwapPath: [],
    minLongTokenAmount: 0,
    minShortTokenAmount: 0,
    shouldUnwrapNativeToken: false,
    executionFee: executionFee,
    callbackGasLimit: 0,
  };

  const nonce = await ethers.provider.getTransactionCount(wallet.address);
  console.log("nonce", nonce);

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [withdrawalVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [
      wbtcUsdMarketToken.address,
      withdrawalVault.address,
      marketTokenAmount,
    ]),
    exchangeRouter.interface.encodeFunctionData("createWithdrawal", [params]),
  ];
  console.log("multicall args", multicallArgs);

  const txs = [] as Promise<TransactionResponse>[];
  for (let i = 1; i < count; i++) {
    const tx = exchangeRouter.multicall(multicallArgs, {
      value: executionFee,
      gasLimit: gasLimit,
      nonce: nonce + i,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    });
    txs.push(tx);
    console.log("transaction sent", nonce + i);
    await sleep(pauseBetweenTxs);
  }
  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: gasLimit,
    nonce: nonce,
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
  });
  console.log("transaction sent", nonce);
  console.log(tx.nonce, tx.hash);
  for (const tx of txs) {
    const t = await tx;
    console.log(t.nonce, t.hash);
    await sleep(pauseBetweenTxs);
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
