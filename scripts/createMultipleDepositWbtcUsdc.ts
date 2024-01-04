import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";

import { ExchangeRouter, MintableToken } from "../typechain-types";
import { DepositUtils } from "../typechain-types/contracts/exchange/DepositHandler";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers/lib/ethers";
import { parseUnits } from "ethers/lib/utils";
import { TransactionResponse } from "@ethersproject/providers";

const { ethers } = hre;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getContracts() {
  const [marketFactory, roleStore, dataStore, depositVault, router, exchangeRouter, wbtc, usdc] = await Promise.all([
    ethers.getContract("MarketFactory"),
    ethers.getContract("RoleStore"),
    ethers.getContract("DataStore"),
    ethers.getContract("DepositVault"),
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

  return {
    depositVault,
    router,
    exchangeRouter,
    wbtc,
    usdc,
    wbtcUsdMarketAddress,
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
  const { depositVault, router, exchangeRouter, wbtc, usdc, wbtcUsdMarketAddress } = await getContracts();
  const [wallet] = await ethers.getSigners();
  const executionFee = expandDecimals(1, 15); // 0.001 WNT
  const longTokenAmount = expandDecimals(1, 6); // 0.01 wbtc
  const shortTokenAmount = expandDecimals(655, 6); // 655 USDC
  const count = 100;
  const pauseBetweenTxs = 100;
  const gasLimit = 1100000;
  const maxFeePerGas = parseUnits("0.001", "gwei");
  const maxPriorityFeePerGas = 1;

  await ensureERC20Balance(wallet, wbtc, longTokenAmount.mul(count), router.address);
  await ensureERC20Balance(wallet, usdc, shortTokenAmount.mul(count), router.address);

  const params: DepositUtils.CreateDepositParamsStruct = {
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    market: wbtcUsdMarketAddress,
    minMarketTokens: 0,
    shouldUnwrapNativeToken: false,
    executionFee: executionFee,
    callbackGasLimit: 0,
    initialLongToken: wbtc.address,
    longTokenSwapPath: [],
    initialShortToken: usdc.address,
    shortTokenSwapPath: [],
    uiFeeReceiver: ethers.constants.AddressZero,
  };

  const nonce = await ethers.provider.getTransactionCount(wallet.address);
  console.log("nonce", nonce);

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [wbtc.address, depositVault.address, longTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createDeposit", [params]),
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
