// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// since the withdrawal store should be replaceable without requiring a migration
// use normal attributes instead of props mapping like in positions
library Withdrawal {
    struct Props {
        address account;
        address receiver;
        address callbackContract;
        address market;
        uint256 marketTokensLongAmount;
        uint256 marketTokensShortAmount;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        uint256 updatedAtBlock;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes data;
    }
}
