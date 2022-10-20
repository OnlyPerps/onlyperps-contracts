// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Order.sol";
import "../market/Market.sol";

import "../data/DataStore.sol";
import "../events/EventEmitter.sol";

import "../order/OrderStore.sol";
import "../position/PositionStore.sol";

import "../oracle/Oracle.sol";

// OrderUtils has the function executeOrder, which uses IncreaseOrderUtils, DecreaseOrderUtils, SwapOrderUtils
// those libraries need some common functions contained here
library OrderBaseUtils {
    using Order for Order.Props;

    struct CreateOrderParams {
        address receiver;
        address callbackContract;
        address market;
        address initialCollateralToken;
        address[] swapPath;

        uint256 sizeDeltaUsd;
        uint256 acceptablePrice;
        int256 acceptablePriceImpactUsd;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 minOutputAmount;

        Order.OrderType orderType;
        bool isLong;
        bool shouldConvertETH;
    }

    struct ExecuteOrderParams {
        bytes32 key;
        Order.Props order;
        Market.Props[] swapPathMarkets;
        DataStore dataStore;
        EventEmitter eventEmitter;
        OrderStore orderStore;
        PositionStore positionStore;
        Oracle oracle;
        FeeReceiver feeReceiver;
        uint256[] oracleBlockNumbers;
        Market.Props market;
        address keeper;
        uint256 startingGas;
        bytes32 positionKey;
    }

    error EmptyOrder();
    error UnsupportedOrderType();
    error UnacceptablePrice(uint256 executionPrice, uint256 acceptablePrice);

    function isMarketOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.MarketDecrease ||
               orderType == Order.OrderType.Liquidation;
    }

    function isLimitOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.LimitSwap ||
               orderType == Order.OrderType.LimitIncrease ||
               orderType == Order.OrderType.LimitDecrease;
    }

    function isSwapOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketSwap ||
               orderType == Order.OrderType.LimitSwap;
    }

    function isPositionOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.LimitIncrease;
    }

    function isIncreaseOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketIncrease ||
               orderType == Order.OrderType.LimitIncrease;
    }

    function isDecreaseOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.MarketDecrease ||
               orderType == Order.OrderType.LimitDecrease ||
               orderType == Order.OrderType.StopLossDecrease ||
               orderType == Order.OrderType.Liquidation;
    }

    function isLiquidationOrder(Order.OrderType orderType) internal pure returns (bool) {
        return orderType == Order.OrderType.Liquidation;
    }

    function getExecutionPrice(
        Price.Props customPrice,
        uint256 sizeDeltaUsd,
        int256 priceImpactUsd,
        uint256 acceptablePrice,
        bool isLong,
        bool isIncrease
    ) internal pure returns (uint256) {
        // increase order:
        //     - long: use the larger price
        //     - short: use the smaller price
        // decrease order:
        //     - long: use the smaller price
        //     - short: use the larger price
        bool shouldUseMaxPrice = isIncrease ? isLong : !isLong;

        // should price be smaller than acceptablePrice
        // increase order:
        //     - long: price should be smaller than acceptablePrice
        //     - short: price should be larger than acceptablePrice
        // decrease order:
        //     - long: price should be larger than acceptablePrice
        //     - short: price should be smaller than acceptablePrice
        bool shouldPriceBeSmaller = isIncrease ? isLong : !isLong;

        // for market orders, customPrice.min and customPrice.max should be equal
        // for limit orders, customPrice contains the triggerPrice and the best oracle
        // price, we first attempt to fulfill the order using the triggerPrice
        uint256 price = customPrice.pickPrice(shouldUseMaxPrice);

        // adjust price by price impact
        price = price * (sizeDeltaUsd + priceImpactUsd) / sizeDeltaUsd;

        if (shouldPriceBeSmaller && price <= acceptablePrice) {
            return price;
        }

        if (!shouldPriceBeSmaller && price >= acceptablePrice) {
            return price;
        }

        // if the order could not be fulfilled using the triggerPrice
        // check if the best oracle price can fulfill the order
        price = customPrice.pickPrice(!shouldUseMaxPrice);

        // adjust price by price impact
        price = price * (sizeDeltaUsd + priceImpactUsd) / sizeDeltaUsd;

        if (shouldPriceBeSmaller && price <= acceptablePrice) {
            return acceptablePrice;
        }

        if (!shouldPriceBeSmaller && price >= acceptablePrice) {
            return acceptablePrice;
        }

        revert UnacceptablePrice(price, acceptablePrice);
    }

    function validateNonEmptyOrder(Order.Props memory order) internal pure {
        if (order.account() == address(0)) {
            revert EmptyOrder();
        }
    }

    function revertUnsupportedOrderType() internal pure {
        revert UnsupportedOrderType();
    }
}
