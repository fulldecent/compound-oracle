"use strict";

const PriceOracle = artifacts.require("./PriceOracle.sol");
const {deploy} = require('../scripts/javascript/deployUtils');

const posterAddress = process.env["POSTER_ADDRESS"];
if (!posterAddress) {
  throw "POSTER_ADDRESS env var must be set";
}

module.exports = function(deployer, network) {
  deploy(deployer, network, PriceOracle, [posterAddress]);
};
