"use strict";

const web3_ = require('./Web3');

const {OracleErrorEnum, OracleErrorEnumInv, OracleFailureInfoEnumInv} = require('./ErrorReporter');

const checksum = web3_.utils.toChecksumAddress;

assert.oracleSuccess = function(result) {
  if (result.events['OracleFailure']) {
    const failure = result.events['OracleFailure'];
    const error = OracleErrorEnumInv[failure.returnValues[2]];
    const failureInfo = OracleFailureInfoEnumInv[failure.returnValues[3]];

    assert.fail(0, 1, `Expected success: got failure ${JSON.stringify(failure.returnValues)} (Error: ${error}, FailureInfo: ${failureInfo})`);
  }

  return result;
}

assert.hasOracleFailure = function(result, expectedMsgSender, expectedError, expectedFailureInfo, expectedDetail=undefined) {
  const log = result.events['OracleFailure'];

  if (!log) {
    const events = Object.keys(result.events).join(', ');
    assert.fail(0, 1, `Expected log with event OracleFailure, found logs with events: [${events}]`);
  }

  assert.oracleFailureLogMatches(log, expectedMsgSender, expectedError, expectedFailureInfo, expectedDetail);
}

assert.oracleFailureLogMatches = function(log, expectedMsgSender, expectedError, expectedFailureInfo, expectedDetail=undefined) {
  const expected = {
    'MsgSender': expectedMsgSender,
    'Error': OracleErrorEnumInv[expectedError],
    'FailureInfo': OracleFailureInfoEnumInv[expectedFailureInfo]
  }

  const actual = {
    'MsgSender': log.returnValues[0],
    'Error': OracleErrorEnumInv[log.returnValues[2]],
    'FailureInfo': OracleFailureInfoEnumInv[log.returnValues[3]]
  }

  if (expectedDetail !== undefined) {
    expected.Detail = expectedDetail;
    actual.Detail = Number(log.returnValues[4]);
  }

  assert.deepEqual(actual, expected);
}

assert.hasOracleErrorCode = function(actualErrorCode, expectedErrorCode) {
  assert.equal(actualErrorCode, expectedErrorCode, `expected Error.${OracleErrorEnumInv[expectedErrorCode]} (error code ${expectedErrorCode}), instead got Error.${OracleErrorEnumInv[actualErrorCode]} (error code ${actualErrorCode})`);
}

assert.noOracleError = function(actualErrorCode) {
  this.hasOracleErrorCode(actualErrorCode, OracleErrorEnum.NO_ERROR);
}

assert.noOracleErrors = function(actualErrorCodes) {
  for(var i = 0; i < actualErrorCodes.length; i++) {
    this.hasOracleErrorCode(actualErrorCodes[i], OracleErrorEnum.NO_ERROR);
  }
}

assert.hasNoMatchingLog = function(result, event) {
  const logParams = {};

  const log = result.events[event];

  if (log) {
    const events = Object.keys(result.events).join(', ');
    assert.fail(0, 1, `Expected no log with event \`${event}\``);
  }
}

