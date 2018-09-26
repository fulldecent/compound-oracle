"use strict";

const {ErrorEnum, OracleErrorEnum, OracleFailureInfoEnum} = require('./ErrorReporter');
const {fallback, getContract, readAndExecContract} = require('./Contract');
const {checksum, getExpMantissa} = require('./Utils');
const {setInitialPrice, setPendingAnchor, setupPricingContracts,
      setupPricingHarnessContracts, setupPricingContractsWithMultipleAssets,
      validatePriceAndAnchor} = require('./PriceOracleTestHelpers');

require('./PriceOracleUtils');

const PriceOracle = getContract("./PriceOracle.sol");
const EIP20 = getContract("./test/EIP20Harness.sol");

const addressZero = "0x0000000000000000000000000000000000000000";

contract('PriceOracle', function ([root, ...accounts]) {
  const anchorAdmin = accounts[1];
  const nonAdmin = accounts[2];
  const poster = accounts[3];
  const nonPoster = accounts[4];

  describe("admin / _setPendingAnchor", async () => {
    it("can be changed by anchor admin", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

      // asset to use
      const omg = await EIP20.new(100, "omg", 18, "omg").send({from: root});

      // test
      const newScaledPrice = getExpMantissa(0.3);
      const [errorCode0, tx0, _error0] = await readAndExecContract(priceOracle, '_setPendingAnchor', [omg._address, newScaledPrice], {from: anchorAdmin});

      assert.noOracleError(errorCode0);

      assert.equal(newScaledPrice, await priceOracle.methods.pendingAnchors(omg._address).call());
    });

    it("emits a log when changed", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

      // asset to use
      const omg = await EIP20.new(100, "omg", 18, "omg").send({from: root});

      // Let's verify that it captures a non-zero previous value when changing.
      // Step 1: Set an initial value.
      const originalScaledPrice = 3 * 10 ** 17;
      const [errorCode0, tx0, _error0] = await readAndExecContract(priceOracle, '_setPendingAnchor', [omg._address, originalScaledPrice], {from: anchorAdmin});
      assert.noOracleError(errorCode0);

      // Step 2: Change from value 1 to value 2
      const newScaledPrice = 7 * 10 ** 17;
      const [errorCode1, tx1, _error1] = await readAndExecContract(priceOracle, '_setPendingAnchor', [omg._address, newScaledPrice], {from: anchorAdmin});

      assert.noOracleError(errorCode1);

      // Verify both value 1 and value 2 are in the log
      assert.hasLog(tx1, 'NewPendingAnchor', {
        anchorAdmin: checksum(anchorAdmin),
        asset: checksum(omg._address),
        oldScaledPrice: originalScaledPrice.toString(),
        newScaledPrice: newScaledPrice.toString()
      });

      // And let's make sure the new price stuck
      assert.equal(newScaledPrice, await priceOracle.methods.pendingAnchors(omg._address).call());
    });

    it("can not be changed by non-anchor admin", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

      // asset to use
      const omg = await EIP20.new(100, "omg", 18, "omg").send({from: root});

      // test
      const newScaledPrice = getExpMantissa(0.3);
      const result = await priceOracle.methods._setPendingAnchor(omg._address, newScaledPrice).send({from: nonAdmin});

      assert.hasOracleFailure(result,
        checksum(nonAdmin),
        OracleErrorEnum.UNAUTHORIZED,
        OracleFailureInfoEnum.SET_PENDING_ANCHOR_PERMISSION_CHECK
      );

      assert.equal(0, await priceOracle.methods.pendingAnchors(omg._address).call());
    });
  });

  describe("admin / _setPendingAnchorAdmin", async () => {

    it("anchor admin is initially set to root and pendingAnchorAdmin is 0", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

      assert.matchesAddress(anchorAdmin, await priceOracle.methods.anchorAdmin().call());
      assert.equal(0, await priceOracle.methods.pendingAnchorAdmin().call(), "pendingAnchorAdmin should be zero for a new contract");
    });

    it("can be used by anchor admin", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
      const [errorCode0, _tx0, _error0] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [nonPoster], {from: anchorAdmin});

      assert.noError(errorCode0);
      assert.matchesAddress(nonPoster, await priceOracle.methods.pendingAnchorAdmin().call());
      assert.matchesAddress(anchorAdmin, await priceOracle.methods.anchorAdmin().call());
    });

    it("can be used to clear the pendingAnchorAdmin", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
      const [errorCode0, _tx0, _error0] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [nonPoster], {from: anchorAdmin});
      assert.noError(errorCode0);

      const [errorCode1, _tx1, _error1] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [0], {from: anchorAdmin});
      assert.noError(errorCode1);

      assert.equal(addressZero, await priceOracle.methods.pendingAnchorAdmin().call());
      assert.matchesAddress(anchorAdmin, await priceOracle.methods.anchorAdmin().call());
    });

    it("fails if not called by admin", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});

      const [errorCode, _tx, _error] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [nonPoster], {from: nonPoster});

      assert.hasErrorCode(errorCode, OracleErrorEnum.UNAUTHORIZED);
    });

    it("emits a log when pendingAnchorAdmin is changed", async () => {
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
      const [_errorCode, tx, _error] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [nonPoster], {from: anchorAdmin});

      assert.hasLog(tx, 'NewPendingAnchorAdmin', {oldPendingAnchorAdmin: addressZero, newPendingAnchorAdmin: checksum(nonPoster)});
    });
  });

  describe("admin / _acceptAnchorAdmin", async () => {

    it("fails if not called by pendingAnchorAdmin", async () => {
      // setup
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
      const [errorCode0, _tx0, _error0] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [nonPoster], {from: anchorAdmin});
      assert.noError(errorCode0);

      // test
      const [errorCode1, _tx1, _error1] = await readAndExecContract(priceOracle, '_acceptAnchorAdmin', [], {from: anchorAdmin});

      // verify
      assert.hasErrorCode(errorCode1, OracleErrorEnum.UNAUTHORIZED);

      // pendingAnchorAdmin and anchorAdmin remain unchanged
      assert.matchesAddress(nonPoster, await priceOracle.methods.pendingAnchorAdmin().call());
      assert.matchesAddress(anchorAdmin, await priceOracle.methods.anchorAdmin().call());
    });

    it("succeeds if called by pendingAnchorAdmin", async () => {
      // setup
      const priceOracle = await PriceOracle.new(poster).send({from: anchorAdmin});
      const [errorCode0, _tx0, _error0] = await readAndExecContract(priceOracle, '_setPendingAnchorAdmin', [nonPoster], {from: anchorAdmin});
      assert.noError(errorCode0);

      // test
      const [errorCode1, tx1, _error1] = await readAndExecContract(priceOracle, '_acceptAnchorAdmin', [], {from: nonPoster});

      // verify
      assert.noError(errorCode1);
      assert.hasLog(tx1, 'NewAnchorAdmin', {oldAnchorAdmin: checksum(anchorAdmin), newAnchorAdmin: checksum(nonPoster)});

      // pendingAnchorAdmin is cleared and anchor admin is updated
      assert.equal(0, await priceOracle.methods.pendingAnchorAdmin().call(), "pendingAnchorAdmin should have been cleared");
      assert.matchesAddress(nonPoster, await priceOracle.methods.anchorAdmin().call());

      // calling again should fail
      const [errorCode2, _tx2, _error2] = await readAndExecContract(priceOracle, '_acceptAnchorAdmin', [], {from: nonPoster});
      assert.hasErrorCode(errorCode2, OracleErrorEnum.UNAUTHORIZED);
    });
  });

  async function testSetPricesInitialHappyPath(numAssets) {
    const {priceOracle, assets} = await setupPricingContractsWithMultipleAssets(anchorAdmin, poster, root, numAssets);

    const assetAddresses = assets.map(a => a._address);
    const prices = Array(numAssets).fill().map((_,i) => getExpMantissa((i+1)*0.1));

    const [errorCodes, tx, _error]  = await readAndExecContract(priceOracle, 'setPrices', [assetAddresses, prices], {from: poster});

    assert.noOracleErrors(errorCodes);
    assert.hasNoMatchingLog(tx, 'CappedPricePosted');

    for (let i=0; i<numAssets; i++) {
      await validatePriceAndAnchor(priceOracle, assets[i], prices[i], prices[i]);

      assert.hasLog(tx, 'PricePosted', {
        asset: checksum(assets[i]._address),
        previousPriceMantissa: '0',
        requestedPriceMantissa: prices[i].toString(),
        newPriceMantissa: prices[i].toString()
      }, ['asset', checksum(assets[i]._address)]);
    }
  }

  describe('pause', async () => {
    it("starts unpaused", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const initialPrice = getExpMantissa(0.3);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      // Check that it's not paused
      assert.equal(await priceOracle.methods.paused().call(), false);

      // Check that the price is accessible
      const [price, tx, _error] = await readAndExecContract(priceOracle, 'getPrice', [asset._address], {from: nonPoster});
      assert.oracleSuccess(tx);
      assert.equal(price, initialPrice);
    });

    it("can be paused and unpaused by anchorAdmin", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      // Check that it's not paused
      assert.equal(await priceOracle.methods.paused().call(), false);

      const [errorCodes, tx, _error] = await readAndExecContract(priceOracle, '_setPaused', [true], {from: anchorAdmin});
      assert.oracleSuccess(tx);

      assert.hasLog(tx, 'SetPaused', {
        newState: true
      });

      // Check that it is paused
      assert.equal(await priceOracle.methods.paused().call(), true);

      const [errorCodes2, tx2, _error2] = await readAndExecContract(priceOracle, '_setPaused', [false], {from: anchorAdmin});
      assert.oracleSuccess(tx2);

      assert.hasLog(tx2, 'SetPaused', {
        newState: null
      });

      // Check that it is no longer paused
      assert.equal(await priceOracle.methods.paused().call(), false);
    });

    it("cannot be paused by poster", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      // Check that it's not paused
      assert.equal(await priceOracle.methods.paused().call(), false);

      const [errorCodes, tx, _error] = await readAndExecContract(priceOracle, '_setPaused', [true], {from: poster});
      assert.hasOracleErrorCode(errorCodes[0], OracleErrorEnum.UNAUTHORIZED);

      assert.hasOracleFailure(tx,
        checksum(poster),
        OracleErrorEnum.UNAUTHORIZED,
        OracleFailureInfoEnum.SET_PAUSED_OWNER_CHECK
      );

      // Check that it is not paused
      assert.equal(await priceOracle.methods.paused().call(), false);
    });

    it("cannot be paused by non-poster", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      // Check that it's not paused
      assert.equal(await priceOracle.methods.paused().call(), false);

      const [errorCodes, tx, _error] = await readAndExecContract(priceOracle, '_setPaused', [true], {from: nonPoster});
      assert.hasOracleErrorCode(errorCodes[0], OracleErrorEnum.UNAUTHORIZED);

      assert.hasOracleFailure(tx,
        checksum(nonPoster),
        OracleErrorEnum.UNAUTHORIZED,
        OracleFailureInfoEnum.SET_PAUSED_OWNER_CHECK
      );

      // Check that it is not paused
      assert.equal(await priceOracle.methods.paused().call(), false);
    });

    it("cannot be un-paused by non-admin", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const [errorCodes, tx, _error] = await readAndExecContract(priceOracle, '_setPaused', [true], {from: anchorAdmin});
      assert.oracleSuccess(tx);

      // Check that it is paused
      assert.equal(await priceOracle.methods.paused().call(), true);

      const [errorCodes2, tx2, _error2] = await readAndExecContract(priceOracle, '_setPaused', [false], {from: poster});
      assert.hasOracleErrorCode(errorCodes2[0], OracleErrorEnum.UNAUTHORIZED);

      assert.hasOracleFailure(tx2,
        checksum(poster),
        OracleErrorEnum.UNAUTHORIZED,
        OracleFailureInfoEnum.SET_PAUSED_OWNER_CHECK
      );

      // Check that it is still paused
      assert.equal(await priceOracle.methods.paused().call(), true);
    });

    it("emits an error and returns 0 when paused", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const [errorCodes, tx, _error] = await readAndExecContract(priceOracle, '_setPaused', [true], {from: anchorAdmin});
      assert.oracleSuccess(tx);

      // Check that it is paused
      assert.equal(await priceOracle.methods.paused().call(), true);

      const [price, tx2, _error2] = await readAndExecContract(priceOracle, 'getPrice', [asset._address], {from: nonPoster});
      assert.hasNoMatchingLog(tx2, 'OracleFailure');

      assert.equal(price, 0);
    });
  });

  describe("getPrice / setPrices", async () => {

    it("accepts 1 initial price", async () => {
      await testSetPricesInitialHappyPath(1);
    });

    it("accepts 5 initial prices", async () => {
      await testSetPricesInitialHappyPath(5);
    });

    it("accepts 20 initial prices", async () => {
      await testSetPricesInitialHappyPath(20);
    });

    it("handles partial failures", async () => {
      const {priceOracle, assets} = await setupPricingContractsWithMultipleAssets(anchorAdmin, poster, root, 2);

      const assetAddresses = [0, assets[0]._address, 0, 0, assets[1]._address];
      const prices = [5, 5, 5, 5, 0];

      const [errorCodes, tx, _error]  = await readAndExecContract(priceOracle, 'setPrices', [assetAddresses, prices], {from: poster});

      const logs = tx.events['OracleFailure'];

      assert.noOracleError(errorCodes[0]);
      assert.noOracleError(errorCodes[1]);
      assert.noOracleError(errorCodes[2]);
      assert.noOracleError(errorCodes[3]);
      assert.hasOracleErrorCode(errorCodes[4], OracleErrorEnum.FAILED_TO_SET_PRICE);
      const log = logs;

      assert.oracleFailureLogMatches(log, checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE, OracleFailureInfoEnum.SET_PRICE_NO_ANCHOR_PRICE_OR_INITIAL_PRICE_ZERO);

      await validatePriceAndAnchor(priceOracle, assets[0], prices[1], prices[1]);
      await validatePriceAndAnchor(priceOracle, assets[1], prices[4], prices[4]);
    });

    it("rejects mis-matched param array sizes", async () => {
      const numAddresses = 3;
      const numPrices = numAddresses + 1;
      const {priceOracle, assets} = await setupPricingContractsWithMultipleAssets(anchorAdmin, poster, root, numAddresses);

      const assetAddresses = assets.map(a => a._address);
      const prices = Array(numPrices).fill().map((_,i) => getExpMantissa((i+1)*0.1));

      const [errorCodes, tx, _error]  = await readAndExecContract(priceOracle, 'setPrices', [assetAddresses, prices], {from: poster});

      assert.hasOracleErrorCode(errorCodes[0], OracleErrorEnum.FAILED_TO_SET_PRICE);

      assert.hasOracleFailure(tx,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICES_PARAM_VALIDATION
      );
    });

    it("rejects empty address array", async () => {
      const numPrices = 1;
      const {priceOracle} = await setupPricingContractsWithMultipleAssets(anchorAdmin, poster, root, 1);

      const prices = Array(numPrices).fill().map((_,i) => getExpMantissa((i+1)*0.1));

      const [errorCodes, tx, _error]  = await readAndExecContract(priceOracle, 'setPrices', [[], prices], {from: poster});

      assert.hasOracleErrorCode(errorCodes[0], OracleErrorEnum.FAILED_TO_SET_PRICE);

      assert.hasOracleFailure(tx,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICES_PARAM_VALIDATION
      );
    });

    it("rejects caller who is not poster", async () => {
      const numAddresses = 3;
      const numPrices = numAddresses + 1;
      const {priceOracle, assets} = await setupPricingContractsWithMultipleAssets(anchorAdmin, poster, root, numAddresses);

      const assetAddresses = assets.map(a => a._address);
      const prices = Array(numPrices).fill().map((_,i) => getExpMantissa((i+1)*0.1));

      const [errorCodes, tx, _error]  = await readAndExecContract(priceOracle, 'setPrices', [assetAddresses, prices], {from: nonPoster});

      assert.hasOracleErrorCode(errorCodes[0], OracleErrorEnum.UNAUTHORIZED);

      assert.equal(errorCodes.length, 1, "should return a single permission error");

      assert.hasOracleFailure(tx,
        checksum(nonPoster),
        OracleErrorEnum.UNAUTHORIZED,
        OracleFailureInfoEnum.SET_PRICE_PERMISSION_CHECK
      );
    });
  });

  describe("setPrice", async () => {

    const expectNoPriceSentToMoneyMarket = 0;
    const expectNoAnchor = 0;

    it("rejects a call by non-poster", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const newScaledPrice = getExpMantissa(0.3);
      const result = await priceOracle.methods.setPrice(asset._address, newScaledPrice).send({from: nonPoster});

      assert.hasOracleFailure(result,
        checksum(nonPoster),
        OracleErrorEnum.UNAUTHORIZED,
        OracleFailureInfoEnum.SET_PRICE_PERMISSION_CHECK
      );
    });

    it("accepts an asset address of 0", async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      const asset = { _address: 0};
      const newScaledPrice = getExpMantissa(0.3);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, newScaledPrice], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasNoMatchingLog(tx, 'CappedPricePosted');

      await validatePriceAndAnchor(priceOracle, asset, newScaledPrice, newScaledPrice);
    });

    it("accepts an initial price", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const newScaledPrice = getExpMantissa(0.3);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, newScaledPrice], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasNoMatchingLog(tx, 'CappedPricePosted');

      await validatePriceAndAnchor(priceOracle, asset, newScaledPrice, newScaledPrice);
    });

    it("accepts an in-range non-initial price", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const initialPrice = getExpMantissa(0.3);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      const secondPrice = getExpMantissa(0.305);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, secondPrice], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasNoMatchingLog(tx, 'CappedPricePosted');

      await validatePriceAndAnchor(priceOracle, asset, secondPrice, initialPrice);
    });

    it("caps to max an over-range non-initial price", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const initialPrice = getExpMantissa(10);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      const secondPrice = getExpMantissa(20);
      const expectedCappedPrice= getExpMantissa(11);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, secondPrice], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasLog(tx, 'CappedPricePosted', {
        asset: checksum(asset._address),
        requestedPriceMantissa: secondPrice.toString(),
        anchorPriceMantissa: initialPrice.toString(),
        cappedPriceMantissa: expectedCappedPrice.toString()
      });

      await validatePriceAndAnchor(priceOracle, asset, expectedCappedPrice, initialPrice);
    });

    it("caps to max an under-range non-initial price", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const initialPrice = getExpMantissa(10);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      const secondPriceZero = 0;
      const expectedCappedPrice= getExpMantissa(9);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, secondPriceZero], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasLog(tx, 'CappedPricePosted', {
        asset: checksum(asset._address),
        requestedPriceMantissa: secondPriceZero.toString(),
        anchorPriceMantissa: initialPrice.toString(),
        cappedPriceMantissa: expectedCappedPrice.toString()
      });

      await validatePriceAndAnchor(priceOracle, asset, expectedCappedPrice, initialPrice);
    });

    // making sure everything works fine if we set a pending anchor before anything else happens
    it("accepts an in-range price when the only previous activity was setting a pending anchor", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const pendingAnchorPrice = getExpMantissa(0.3);

      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      const newScaledPrice = getExpMantissa(0.305);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, newScaledPrice], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasNoMatchingLog(tx, 'CappedPricePosted');

      // Note that the accepted newScaledPrice becomes the anchor, not the pending anchor.
      await validatePriceAndAnchor(priceOracle, asset, newScaledPrice, newScaledPrice, 0);
    });

    it("rejects an out-of-range price when the only previous activity was setting a pending anchor", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const pendingAnchorPrice = getExpMantissa(0.3);

      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      const outOfRangePrice = pendingAnchorPrice * 2.5;

      const result = await priceOracle.methods.setPrice(asset._address, outOfRangePrice).send({from: poster});
      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_MAX_SWING_CHECK,
        1.5e18 // 150%
      );

      // No price is sent to money market, no anchor is set, and the pending anchor remains set non-zero.
      await validatePriceAndAnchor(priceOracle, asset, expectNoPriceSentToMoneyMarket, expectNoAnchor, pendingAnchorPrice);
    });

    // If the pending anchor is 1, 2, 3 or 4, all prices movements are more than a 10% swing.
    // This test is just to verify those movements are still rejected
    it("rejects an out-of-range price even with a delta of 1", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const pendingAnchorPrice = 3;

      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      const outOfRangePrice = 4;

      const result = await priceOracle.methods.setPrice(asset._address, outOfRangePrice).send({from: poster});
      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_MAX_SWING_CHECK,
        333333333333333300
      );

      // No price is sent to money market, no anchor is set, and the pending anchor remains set non-zero.
      await validatePriceAndAnchor(priceOracle, asset, expectNoPriceSentToMoneyMarket, expectNoAnchor, pendingAnchorPrice);
    });

    it("rejects a way out of range price", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const pendingAnchorPrice = getExpMantissa(0.3);

      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      const outOfRangePrice = -1;

      const result = await priceOracle.methods.setPrice(asset._address, outOfRangePrice).send({from: poster});
      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_CALCULATE_SWING,
        ErrorEnum.INTEGER_OVERFLOW
      );

      // No price is sent to money market, no anchor is set, and the pending anchor remains set non-zero.
      await validatePriceAndAnchor(priceOracle, asset, expectNoPriceSentToMoneyMarket, expectNoAnchor, pendingAnchorPrice);
    });

    it("accepts an in-range of pending anchor non-initial price", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);

      const initialPrice = getExpMantissa(0.3);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      // Let's set the pending anchor a LOT higher than the first anchor
      const pendingAnchorPrice = getExpMantissa(10);
      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      // new price far from first price but is close to the pending anchor so should be accepted
      const newScaledPrice = getExpMantissa(10.5);

      const [errorCode, tx, _error]  = await readAndExecContract(priceOracle, 'setPrice', [asset._address, newScaledPrice], {from: poster});
      assert.noOracleError(errorCode);

      assert.hasNoMatchingLog(tx, 'CappedPricePosted');

      // Note that the accepted newScaledPrice becomes the anchor, not the pending anchor.
      await validatePriceAndAnchor(priceOracle, asset, newScaledPrice, newScaledPrice, 0);
    });

    it("rejects an out-of-range of pending anchor non-initial price", async () => {
      const {priceOracle, asset} = await setupPricingHarnessContracts(anchorAdmin, poster, root);

      const initialPrice = getExpMantissa(0.3);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      const pendingAnchorPrice = getExpMantissa(10);
      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      // Let's clear the initial price from the money market price harness so we can
      // verify it remains unset after the second call to price oracle
      await priceOracle.methods.harnessClearStoredPrice(asset._address).send({from: root});

      // Because of the pending anchor at 10, a price that matches the initial anchor is no longer valid
      const outOfRangePrice = initialPrice;

      const result = await priceOracle.methods.setPrice(asset._address, outOfRangePrice).send({from: poster});
      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_MAX_SWING_CHECK,
        0.97e18 // 97%
      );

      // No price is sent to money market, the anchor remains at initialPrice, AND the pendingAnchor remains set to pendingAnchorPrice.
      await validatePriceAndAnchor(priceOracle, asset, expectNoPriceSentToMoneyMarket, initialPrice, pendingAnchorPrice);
    });

    it("fails gracefully if initial price is zero", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const result = await priceOracle.methods.setPrice(asset._address, 0).send({from: poster});

      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_NO_ANCHOR_PRICE_OR_INITIAL_PRICE_ZERO
      );
    });

    // in the non-initial case, if there's no pending anchor, it will cap to max so no error will occur. Tested above.
    it("fails gracefully if pending anchor set and zero price provided", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const initialPrice = getExpMantissa(0.3);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      const pendingAnchorPrice = getExpMantissa(1);
      await setPendingAnchor(priceOracle, asset, pendingAnchorPrice, anchorAdmin);

      const result = await priceOracle.methods.setPrice(asset._address, 0).send({from: poster});

      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_MAX_SWING_CHECK,
        1e18 // 100%
      );
    });

    // test that a very very very small pending anchor will fail with zero price given
    it("fails gracefully if pending anchor set to near zero and zero price provided", async () => {
      const {priceOracle, asset} = await setupPricingContracts(anchorAdmin, poster, root);
      const initialPrice = getExpMantissa(0.3);
      await setInitialPrice(priceOracle, asset, initialPrice, poster);

      await setPendingAnchor(priceOracle, asset, 1, anchorAdmin);

      const result = await priceOracle.methods.setPrice(asset._address, 0).send({from: poster});

      assert.hasOracleFailure(result,
        checksum(poster),
        OracleErrorEnum.FAILED_TO_SET_PRICE,
        OracleFailureInfoEnum.SET_PRICE_MAX_SWING_CHECK,
        1e18 // 100%
      );
    });
  });

  describe("fallback", async () => {
    it("reverts on ether payment", async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      await assert.revert(fallback(priceOracle, {value: 100, from: root}));
    });

    it("reverts when unpaid", async () => {
      const {priceOracle} = await setupPricingContracts(anchorAdmin, poster, root);

      await assert.revert(fallback(priceOracle, {value: 0, from: root}));
    });
  });
});