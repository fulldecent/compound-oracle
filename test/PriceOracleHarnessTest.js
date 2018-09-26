"use strict";

const {ErrorEnum, OracleErrorEnum, OracleFailureInfoEnum} = require('./ErrorReporter');
const {getContract, readAndExecContract} = require('./Contract');
const {bigNums, checksum, getExpMantissa} = require('./Utils');

require('./PriceOracleUtils');

const PriceOracle = getContract("./test/PriceOracleHarness.sol");
const EIP20 = getContract("./test/EIP20Harness.sol");

contract('PriceOracleHarness', function ([root, ...accounts]) {

  const anchorAdmin = accounts[1];
  const poster = accounts[2];

  async function setupPricingContracts(anchorAdmin, poster, root) {
    const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
    const asset = await EIP20.new(100, "omg", 18, "omg").send({from: root});

    return {
      priceOracle: priceOracle,
      asset: asset
    }
  }

  function extractCapToMaxResults(results) {
    return {
      errorCode: results[0],
      wasCapped: results[1],
      newPrice: results[2]
    }
  }

  async function runCapToMaxInRange(priceOracle, anchorPrice, price, poster) {
    const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCapToMax', [anchorPrice, price], {from: poster});
    const {errorCode, wasCapped, newPrice} = extractCapToMaxResults(results);

    assert.noError(errorCode);
    assert.isFalse(wasCapped, "wasCapped");
    assert.equal(newPrice, price);
  }

  async function runCapToMaxOutOfRange(priceOracle, anchorPrice, price, expectedNewPrice, poster) {
    const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCapToMax', [anchorPrice, price], {from: poster});
    const {errorCode, wasCapped, newPrice} = extractCapToMaxResults(results);

    assert.noError(errorCode);
    assert.isTrue(wasCapped, "wasCapped");
    assert.equal(newPrice, expectedNewPrice);
  }

  describe("harnessCapToMax", async () => {
    it('returns in range values as-is', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const anchorPrice = getExpMantissa(10);
      const minPrice = getExpMantissa(9);
      const maxPrice = getExpMantissa(11);

      await runCapToMaxInRange(priceOracle, anchorPrice, minPrice);
      await runCapToMaxInRange(priceOracle, anchorPrice, anchorPrice);
      await runCapToMaxInRange(priceOracle, anchorPrice, maxPrice);
    });

    it('caps an out of range price to the appropriate max or min value', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const anchorPrice = getExpMantissa(10);
      const minCap = getExpMantissa(9);
      const maxCap = getExpMantissa(11);

      await runCapToMaxOutOfRange(priceOracle, anchorPrice, 0, minCap);
      await runCapToMaxOutOfRange(priceOracle, anchorPrice, getExpMantissa(8), minCap);
      await runCapToMaxOutOfRange(priceOracle, anchorPrice, getExpMantissa(12), maxCap);
      await runCapToMaxOutOfRange(priceOracle, anchorPrice, getExpMantissa(100), maxCap);
    });

    it('handles overflow on 1 plus maxSwing', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);
      await priceOracle.methods.harnessSetMaxSwing(bigNums.maxUint).send({from: poster});

      const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCapToMax', [getExpMantissa(10), getExpMantissa(10)], {from: poster});
      const {errorCode, wasCapped, newPrice} = extractCapToMaxResults(results);

      assert.hasErrorCode(errorCode, ErrorEnum.INTEGER_OVERFLOW);
      assert.isFalse(wasCapped, "wasCapped");
      assert.equal(newPrice, 0);
    });

    it('handles underflow on 1 minus maxSwing', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);
      await priceOracle.methods.harnessSetMaxSwing(getExpMantissa(2)).send({from: poster});

      const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCapToMax', [getExpMantissa(10), getExpMantissa(10)], {from: poster});
      const {errorCode, wasCapped, newPrice} = extractCapToMaxResults(results);

      assert.hasErrorCode(errorCode, ErrorEnum.INTEGER_UNDERFLOW);
      assert.isFalse(wasCapped, "wasCapped");
      assert.equal(newPrice, 0);
    });

    it('handles overflow on calculating max', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCapToMax', [bigNums.maxUint, getExpMantissa(10)], {from: poster});
      const {errorCode, wasCapped, newPrice} = extractCapToMaxResults(results);

      assert.hasErrorCode(errorCode, ErrorEnum.INTEGER_OVERFLOW);
      assert.isFalse(wasCapped, "wasCapped");
      assert.equal(newPrice, 0);
    });
  });

  describe('harnessCalculateSwing', async () => {

    function extractCalculateSwingResults(results) {
      return {
        errorCode: results[0],
        swing: results[1]
      }
    }

    it('handles price equal anchor', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const anchorPrice = getExpMantissa(10);

      const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCalculateSwing', [anchorPrice, anchorPrice], {from: poster});
      const {errorCode, swing} = extractCalculateSwingResults(results);

      assert.noError(errorCode);
      assert.equal(swing, 0);
    });

    it('handles price less than anchor', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const anchorPrice = getExpMantissa(10);
      const price = getExpMantissa(8);
      const expectedSwing = getExpMantissa(0.2); // (10-8)/10 = 2/10

      const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCalculateSwing', [anchorPrice, price], {from: poster});
      const {errorCode, swing} = extractCalculateSwingResults(results);

      assert.noError(errorCode);
      assert.equal(swing, expectedSwing);
    });

    it('handles price greater than anchor', async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const anchorPrice = getExpMantissa(10);
      const price = getExpMantissa(14);
      const expectedSwing = getExpMantissa(0.4); // (14-10)/10 = 4/10

      const [results, _tx0, _error0] = await readAndExecContract(priceOracle, 'harnessCalculateSwing', [anchorPrice, price], {from: poster});
      const {errorCode, swing} = extractCalculateSwingResults(results);

      assert.noError(errorCode);
      assert.equal(swing, expectedSwing);
    });
  });

  describe("setPrice", async () => {

    it('fails gracefully if capToMax fails', async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      await priceOracle.methods.harnessSetPriceAnchor(asset._address, bigNums.maxUint, 1).send({from: anchorAdmin});

      const result = await priceOracle.methods.setPrice(asset._address, getExpMantissa(3)).send({from: poster});

      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_CAP_TO_MAX
      );

      const numMoneyMarketCalls = await priceOracle.methods.numSetPriceCalls(asset._address).call();
      assert.equal(numMoneyMarketCalls, 0);
    });

    it('fails gracefully if anchorPrice is zero and anchor period is non-zero', async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      await priceOracle.methods.harnessSetPriceAnchor(asset._address, 0, 1).send({from: anchorAdmin});

      const result = await priceOracle.methods.setPrice(asset._address, getExpMantissa(3)).send({from: poster});

      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_NO_ANCHOR_PRICE_OR_INITIAL_PRICE_ZERO
      );

      const numMoneyMarketCalls = await priceOracle.methods.numSetPriceCalls(asset._address).call();
      assert.equal(numMoneyMarketCalls, 0);
    });
  });
});