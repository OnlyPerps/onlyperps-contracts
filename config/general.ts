import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat, expandDecimals } from "../utils/math";

export default async function ({ network }: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat") {
    // Note that this is only for the hardhat config
    return {
      feeReceiver: ethers.constants.AddressZero,
      holdingAddress: ethers.constants.AddressZero,
      maxUiFeeFactor: decimalToFloat(5, 5), // 0.005%
      minHandleExecutionErrorGas: 1_200_000,
      minHandleExecutionErrorGasToForward: 1_000_000,
      minAdditionalGasForExecution: 1_000_000,

      depositGasLimitSingle: 0,
      depositGasLimitMultiple: 0,
      withdrawalGasLimit: 0,

      singleSwapGasLimit: 0,
      increaseOrderGasLimit: 0,
      decreaseOrderGasLimit: 0,
      swapOrderGasLimit: 0,

      tokenTransferGasLimit: 200_000,
      nativeTokenTransferGasLimit: 50_000,

      estimatedGasFeeBaseAmount: 0,
      estimatedGasFeeMultiplierFactor: 0,

      executionGasFeeBaseAmount: 0,
      executionGasFeeMultiplierFactor: 0,

      maxSwapPathLength: 5,
      maxCallbackGasLimit: 2_000_000,
      minCollateralUsd: decimalToFloat(1),

      minPositionSizeUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,

      positionFeeReceiverFactor: 0,
      swapFeeReceiverFactor: 0,
      borrowingFeeReceiverFactor: 0,

      skipBorrowingFeeForSmallerSide: false,
    };
  }

  const generalConfig = {
    feeReceiver: "0x751713BA6c3Fddb5A14AE63fD68413c17d31927D",
    holdingAddress: "0x99d124c98f5792da3A89Be5A4050d3a3A000D457",
    maxUiFeeFactor: decimalToFloat(2, 4), // 0.0002, 0.02%
    minHandleExecutionErrorGas: 1_200_000,
    minHandleExecutionErrorGasToForward: 1_000_000, // measured gas required for an order cancellation: ~600,000
    minAdditionalGasForExecution: 1_000_000,

    depositGasLimitSingle: 1_500_000,
    depositGasLimitMultiple: 1_800_000,
    withdrawalGasLimit: 1_500_000,

    singleSwapGasLimit: 1_000_000, // measured gas required for a swap in a market increase order: ~600,000
    increaseOrderGasLimit: 4_000_000,
    decreaseOrderGasLimit: 4_000_000,
    swapOrderGasLimit: 3_000_000,

    tokenTransferGasLimit: 200_000,
    nativeTokenTransferGasLimit: 50_000,

    estimatedGasFeeBaseAmount: 500_000, // measured gas for an order execution without any main logic: ~500,000
    estimatedGasFeeMultiplierFactor: expandDecimals(125, 28), // 1.25x

    executionGasFeeBaseAmount: 500_000, // measured gas for an order execution without any main logic: ~500,000
    executionGasFeeMultiplierFactor: expandDecimals(125, 28), // 1.25x

    maxSwapPathLength: 3,
    maxCallbackGasLimit: 2_000_000,
    minCollateralUsd: decimalToFloat(1),

    minPositionSizeUsd: decimalToFloat(1),
    claimableCollateralTimeDivisor: 60 * 60,

    positionFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    swapFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    borrowingFeeReceiverFactor: decimalToFloat(37, 2), // 37%

    skipBorrowingFeeForSmallerSide: true,
  };

  const networkConfig = {
    arbitrumGoerli: {
      requestExpirationBlockAge: 1200, // about 5 minutes assuming 4 blocks per second
    },
    avalancheFuji: {
      requestExpirationBlockAge: 150, // about 5 minutes assuming 1 block per 2 seconds
    },
    arbitrum: {
      requestExpirationBlockAge: 1200, // about 5 minutes assuming 4 blocks per second
      estimatedGasFeeBaseAmount: 8_000_000,
      executionGasFeeBaseAmount: 8_000_000,
    },
    avalanche: {
      requestExpirationBlockAge: 150, // about 5 minutes assuming 1 block per 2 seconds
      estimatedGasFeeBaseAmount: 1_000_000,
      executionGasFeeBaseAmount: 1_000_000,
    },
    seiTestnet: {
      requestExpirationBlockAge: 1200, // about 5 minutes assuming 4 blocks per second
      estimatedGasFeeBaseAmount: 8_000_000,
      executionGasFeeBaseAmount: 8_000_000,
    },
    seiMainnet: {
      requestExpirationBlockAge: 1200, // about 5 minutes assuming 4 blocks per second
      estimatedGasFeeBaseAmount: 8_000_000,
      executionGasFeeBaseAmount: 8_000_000,
    },
  }[network.name];

  if (!networkConfig) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return { ...generalConfig, ...networkConfig };
}
