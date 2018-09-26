"use strict";

const BigNumber = require('bignumber.js');
const Immutable = require('seamless-immutable');
const {deploy, deployNew, load, save} = require('./deployUtils');

const PriceOracle = artifacts.require("./PriceOracle.sol");

const network = process.env["NETWORK"];

if (!network) {
  throw "NETWORK env var must be set";
}

// Returns the mantissa of an Exp with given floating value
function getExpMantissa(float) {
  return Math.floor(float * 1.0e18);
}

async function setTokenPrices() {
  const tokenConfig = load(network, ['..', 'money-market']);
  const config = load(network);

  const tokens = Immutable.getIn(tokenConfig, ["Tokens"]);
  if (!tokens) {
    throw `No tokens for network: ${network}`;
  }

  const oracleAddress = Immutable.getIn(config, ["Contracts", "PriceOracle"]);
  if (!oracleAddress) {
    throw `No PriceOracle address stored for network: ${network}`;
  }

  const oracle = PriceOracle.at(oracleAddress);

  for (let token of Object.values(tokens)) {
    if (token.address && token.price) {
      const newPrice = new BigNumber(getExpMantissa(token.price));

      // First, get the current price and ignore if they match
      const currentPrice = await oracle.assetPrices(token.address);

      if (newPrice.toString() !== currentPrice.toString()) {
        console.log(`Setting price for ${token.name} from ${currentPrice.toString()} to ${newPrice.toString()}...`);

        const result = await oracle.setPrice(token.address, newPrice.toString());
        const error = result.logs.find((log) => log.event == "OracleFailure");
        const log = result.logs.find((log) => log.event == "PricePosted");

        if (error) {
          throw `ErrorReporter OracleFailure: Error=${error.args.error} Info=${error.args.info} Detail=${error.args.detail}`;
        }

        if (!log) {
          throw `Could not find log "PricePosted" in result logs [${result.logs.map((log) => log.event).join(',')}]`
        }

        console.log(`Setting price for ${token.name} successfully.`);
      }
    } else {
      if (!token.address) {
        console.log(`No address provided for ${token.symbol}`);
      }

      if (!token.price) {
        console.log(`No price provided for ${token.symbol}`);
      }
    }
  }
};

module.exports = setTokenPrices;