"use strict";

const {getContract} = require('./Contract');
const EIP20 = getContract("./test/EIP20Harness.sol");
const {gas, getExpMantissa} = require('./Utils');
require('./PriceOracleUtils');

const PriceOracle = getContract("./PriceOracle.sol");

async function setupPricingGasContracts(anchorAdmin, poster, root) {
  const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

  const asset = await EIP20.new(100, "omg", 18, "omg").send({from: root});

  return {
    priceOracle: priceOracle,
    asset: asset
  }
}

async function setupPricingGasContractsWithMultipleAssets(anchorAdmin, poster, root, numAssets=5) {
  const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

  if (numAssets < 1) {
    throw "numAssets must be >= 1"
  }

  let assets = Array(numAssets);
  for(let i = 0; i< numAssets; i++) {
    assets[i] = await EIP20.new(100, "omg"+i, 18, "omg"+i).send({from: root});
  }

  return {
    priceOracle: priceOracle,
    assets: assets
  }
}

contract('PriceOracle', function ([root, ...accounts]) {

  const anchorAdmin = accounts[1];
  const poster = accounts[2];

  async function setupForMultiPriceTest(numAssets) {
    const {priceOracle, assets} = await setupPricingGasContractsWithMultipleAssets(anchorAdmin, poster, root, numAssets);

    const assetAddresses = assets.map(a => a._address);
    const prices = Array(numAssets).fill().map((_, i) => getExpMantissa((i + 1) * 0.1));

    return {
      priceOracle: priceOracle,
      assets: assets,
      assetAddresses: assetAddresses,
      prices: prices
    }
  }

  describe("gas test / setPrice", async () => {

    it("sets a non-initial price for expected gas cost @gas", async () => {
      const {priceOracle, asset} = await setupPricingGasContracts(anchorAdmin, poster, root);

      await priceOracle.methods.setPrice(asset._address, getExpMantissa(0.5)).send({from: poster});

      // for second update use a different price that is in max swing range
      const second = await priceOracle.methods.setPrice(asset._address, getExpMantissa(0.55)).send({from: poster});

      // const gasEstimatedFromOpCodes = 36083;
      // non-initial: reads 8, writes 0, updates 1, calls 1
      const otherOps = 7583; // total from opcodes not already estimated as gas.transaction, gas.storage_new, gas.storage_read, or gas.call
      const unknownGas = 5000;
      const expectedSecondGas = unknownGas + otherOps + gas.transaction + gas.storage_update + (7 * gas.storage_read);
      console.log(`setPrice: expectedSecondGas=${expectedSecondGas}, result.gasUsed=${second.gasUsed}, delta=${expectedSecondGas - second.gasUsed}`);

      assert.withinGas(second, expectedSecondGas, 5000, "non-initial update should cost about 41k gas", true);
    });
  });

  describe("gas test / setPrices", async () => {

    it("sets 1 non-initial prices for expected gas cost @gas", async () => {
      const numAssets = 1;
      const {priceOracle, assetAddresses, prices} = await setupForMultiPriceTest(numAssets);

      await priceOracle.methods.setPrices(assetAddresses, prices).send({from: poster});
      // for second update use different prices that are in max swing range
      const newPrices = prices.map(p => p * 1.02);
      const second = await priceOracle.methods.setPrices(assetAddresses, newPrices).send({from: poster});

      // estimates: non-initial: reads 8, writes 0, updates 1, calls 1
      // const gasEstimatedFromOpCodes = 37440; shows 10 reads; 2 (aka 400 gas) more than expected
      const otherOps = 10340; // total from opcodes not estimated as gas.transaction, gas.storage_new, gas.storage_read, or gas.call
      const unknownGas = 1000;
      const expectedSecondGas = unknownGas + gas.transaction + gas.storage_read + otherOps + (numAssets * (gas.storage_update + (7 * gas.storage_read)));

      console.log(`setPrices 1: expectedSecondGas=${expectedSecondGas}, result.gasUsed=${second.gasUsed}, delta=${expectedSecondGas - second.gasUsed}`);

      assert.withinGas(second, expectedSecondGas, 1000, "setPrices 1 update should cost about 42k", true);
    });

    it("sets 5 non-initial prices for expected gas cost @gas", async () => {
      const numAssets = 5;
      const {priceOracle, assetAddresses, prices} = await setupForMultiPriceTest(numAssets);

      await priceOracle.methods.setPrices(assetAddresses, prices).send({from: poster});
      // for second update use different prices that are in max swing range
      const newPrices = prices.map(p => p * 1.02);
      const second = await priceOracle.methods.setPrices(assetAddresses, newPrices).send({from: poster});

      // estimates: non-initial 1 read and then per asset: reads 8, writes 0, updates 1, calls 1
      // const gasEstimatedFromOpCodes = 98068; shows 46 reads; 10 (aka 2000 gas) more than expected 36 (1 + 5*7)
      const otherOps = 44368; // total from opcodes not estimated as gas.transaction, gas.storage_new, gas.storage_read, or gas.call
      const unknownGas = 4000;
      const expectedSecondGas = unknownGas + gas.transaction + gas.storage_read + otherOps + (numAssets * (gas.storage_update + (7 * gas.storage_read)));

      console.log(`setPrices 5: expectedSecondGas=${expectedSecondGas}, result.gasUsed=${second.gasUsed}, delta=${expectedSecondGas - second.gasUsed}`);

      assert.withinGas(second, expectedSecondGas, 1000, "setPrices with 5 updates should cost about 118k", true);
    });

    it("sets 10 non-initial prices for expected gas cost @gas", async () => {
      const numAssets = 10;
      const {priceOracle, assetAddresses, prices} = await setupForMultiPriceTest(numAssets);

      await priceOracle.methods.setPrices(assetAddresses, prices).send({from: poster});
      // for second update use different prices that are in max swing range
      const newPrices = prices.map(p => p * 1.02);
      const second = await priceOracle.methods.setPrices(assetAddresses, newPrices).send({from: poster});

      // estimates: non-initial 1 read and then per asset: reads 8, writes 0, updates 1, calls 1
      // const gasEstimatedFromOpCodes = 173853; shows 91 reads; 20 (aka 4000 gas) more than expected 71 ( 1 + 10*7)
      const otherOps = 87653; // total from opcodes not estimated as gas.transaction, gas.storage_new, gas.storage_read, or gas.call
      const unknownGas = 8000;
      const expectedSecondGas = unknownGas + gas.transaction + gas.storage_read + otherOps + (numAssets * (gas.storage_update + (7 * gas.storage_read)));

      console.log(`setPrices 10: expectedSecondGas=${expectedSecondGas}, result.gasUsed=${second.gasUsed}, delta=${expectedSecondGas - second.gasUsed}`);

      assert.withinGas(second, expectedSecondGas, 1000, "setPrices with 10 updates should cost about 214k", true);
    });
  });
});

