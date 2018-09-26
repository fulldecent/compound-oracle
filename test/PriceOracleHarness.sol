pragma solidity ^0.4.24;

import "../contracts/PriceOracle.sol";

contract PriceOracleHarness is PriceOracle {
    mapping (address => uint256) updateCount;

    constructor(address poster) public PriceOracle(poster) {
    }

    function numSetPriceCalls(address asset) public view returns (uint256) {
        return updateCount[asset];
    }

    function harnessClearStoredPrice(address asset) public {
        _assetPrices[asset] = Exp({mantissa: 0});
    }

    function setPriceStorageInternal(address asset, uint priceMantissa) internal {
        _assetPrices[asset] = Exp({mantissa: priceMantissa});
        updateCount[asset] += 1;
    }

    function harnessCapToMax(uint anchorPriceMantissa, uint priceMantissa) view public returns (Error, bool, uint) {
        (Error err, bool wasCapped, Exp memory newPrice) = capToMax(Exp({mantissa: anchorPriceMantissa}), Exp({mantissa: priceMantissa}));
        return (err, wasCapped, newPrice.mantissa);
    }

    function harnessCalculateSwing(uint anchorPriceMantissa, uint priceMantissa) pure public returns (Error, uint) {
        (Error err, Exp memory swing) = calculateSwing(Exp({mantissa: anchorPriceMantissa}), Exp({mantissa: priceMantissa}));
        return (err, swing.mantissa);
    }

    function harnessSetMaxSwing(uint newMaxSwingMantissa) public {
        maxSwing = Exp({mantissa: newMaxSwingMantissa});
    }

    function harnessSetPriceAnchor(address asset, uint anchorPriceMantissa, uint anchorPeriod) public {
        anchors[asset] = Anchor({period: anchorPeriod, priceMantissa: anchorPriceMantissa});
    }
}