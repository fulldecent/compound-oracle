"use strict";

const {getContract, readAndExecContract} = require('./Contract');
const EIP20 = getContract("./test/EIP20Harness.sol");
const PriceOracle = getContract("./PriceOracle.sol");
const PriceOracleHarness = getContract("./test/PriceOracleHarness.sol");

async function setupPricingContracts(anchorAdmin, poster, root) {
  const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
  const asset = await EIP20.new(100, "omg", 18, "omg").send({from: root});

  return {
    priceOracle: priceOracle,
    asset: asset
  }
}

async function setupPricingHarnessContracts(anchorAdmin, poster, root) {
  const priceOracle = await PriceOracleHarness.new(poster).send({from: anchorAdmin});
  const asset = await EIP20.new(100, "omg", 18, "omg").send({from: root});

  return {
    priceOracle: priceOracle,
    asset: asset
  }
}

async function setupPricingContractsWithMultipleAssets(anchorAdmin, poster, root, numAssets=5) {
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

async function validatePriceAndAnchor(priceOracle, asset, expectedPriceMantissa, expectedAnchorMantissa, expectedPendingAnchor = 0) {
  const actualPriceMantissa = await priceOracle.methods.getPrice(asset._address).call();

  assert.equal(actualPriceMantissa, expectedPriceMantissa, 'money market price mantissa');

  const actualAnchor = await priceOracle.methods.anchors(asset._address).call();
  assert.equal(actualAnchor.priceMantissa, expectedAnchorMantissa, 'oracle anchor price mantissa');

  await verifyPendingAnchor(priceOracle, asset, expectedPendingAnchor);
}

async function verifyPendingAnchor(priceOracle, asset, pendingAnchorMantissa) {

  assert.equal(await priceOracle.methods.pendingAnchors(asset._address).call(), pendingAnchorMantissa, "pending anchor");
}

async function setPendingAnchor(priceOracle, asset, pendingAnchorMantissa, anchorAdmin) {
  const result = await priceOracle.methods._setPendingAnchor(asset._address, pendingAnchorMantissa).send({from: anchorAdmin});
  assert.oracleSuccess(result);
  await verifyPendingAnchor(priceOracle, asset, pendingAnchorMantissa);
}

// Use this for setup when your test is for a non-initial price
async function setInitialPrice(priceOracle, asset, priceMantissa, poster) {
  const [errorCode, _tx, _error] = await readAndExecContract(priceOracle, 'setPrice', [asset._address, priceMantissa], {from: poster});
  assert.noOracleError(errorCode);

  await validatePriceAndAnchor(priceOracle, asset, priceMantissa, priceMantissa);
}

module.exports = {
  setInitialPrice,
  setPendingAnchor,
  setupPricingContracts,
  setupPricingHarnessContracts,
  setupPricingContractsWithMultipleAssets,
  validatePriceAndAnchor
}
