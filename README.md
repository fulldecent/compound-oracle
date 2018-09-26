[![CircleCI](https://circleci.com/gh/compound-finance/compound-oracle.svg?style=svg)](https://circleci.com/gh/compound-finance/compound-oracle)

Compound Price Oracle
=====================

The Compound Price Oracle receives price updates from a poster (who pulls the prices from exchanges). The price oracle verifies the prices are within valid ranges, and if so, stores the prices so they can be accessed by the Compound Money Market.

See the [Compound Price Oracle Specification](https://github.com/compound-finance/compound-oracle/tree/master/docs/Oracle-Specification.pdf), explaining in plain English how the protocol operates.

Contracts
=========

We detail a few of the core contracts in the Compound protocol.

<dl>
  <dt>Price Oracle</dt>
  <dd>The Compound Price Oracle.</dd>
</dl>

<dl>
  <dt>Careful Math</dt>
  <dd>Library for safe math operations.</dd>
</dl>

<dl>
  <dt>ErrorReporter</dt>
  <dd>Library for tracking error codes and failure conditions.</dd>
</dl>

<dl>
  <dt>Exponential</dt>
  <dd>Library for handling fixed-point decimal numbers.</dd>
</dl>

Installation
------------
To run the price oracle, pull the repository from GitHub and install its dependencies. You will need [yarn](https://yarnpkg.com/lang/en/docs/install/) or [npm](https://docs.npmjs.com/cli/install) installed.

    git clone https://github.com/compound-finance/compound-oracle
    cd compound-oracle
    yarn

You can then compile and deploy the contracts with:

    truffle compile
    POSTER_ADDRESS="0x..." truffle migrate

Testing
-------
Contract tests are defined under the [test
directory](https://github.com/compound-finance/compound-oracle/tree/master/test). To run the tests run:

    scripts/test

or with inspection (visit chrome://inspect) and look for a remote target after running:

    node --inspect node_modules/truffle-core/cli.js test
    
Assertions used in our tests are provided by [ChaiJS](http://chaijs.com).

Code Coverage
-------------
To run code coverage, simply run:

    scripts/coverage

Linting
-------
To lint the code, run:

    scripts/lint

Deployment
----------
To deploy the Price Oracle run:

    ./scripts/blockchain deploy development <address-of-price-poster>

For development, `<address-of-price-poster>` will default to first unlocked account.

Docker
------

To run in docker:

    # Build the docker image
    docker build -t price-oracle .

    # Run a shell to the built image
    docker run -it price-oracle /bin/sh

From within a docker shell, you can interact locally with the protocol via ganache and truffle:

    > ganache-cli &
    > truffle deploy
    > truffle console
    truffle(development)> const {getDeployedAddress} = require("./scripts/javascript/deployUtils")
    truffle(development)> priceOracleAddress=getDeployedAddress('development', 'PriceOracle')
    truffle(development)> priceOracle = PriceOracle.at(priceOracleAddress)
    truffle(development)> priceOracle.poster.call()
    '0x842e5e1a348eb91fc68219ca70db83170ccd9a5e'

Test net
--------

To deploy on test-net, run:

    RINKEBY_PRIVATE_KEY=<...> scripts/blockchain/deploy rinkeby <poster-address>

where the private key refers to a rinkeby private key in hex form (e.g. this can be the value exported from MetaMask under Settings).

You can choose "rinkeby", "kovan" or "ropsten" as your test net.

Additionally, for not main-net, you can put your test-net private keys in a folder and set the environment variable (e.g. in your `~/.bash_profile`):

```sh
ETHEREUM_NETWORKS_HOME=~/.ethereum
```

The project will search this directory for test-net keys, which you can add as such:

```sh
mkdir -p ~/.ethereum
# Store command via editor or:
pbpaste > ~/.ethereum/rinkeby
chmod 600 ~/.ethereum/rinkeby
```

Note: This method is not safe for production. Production keys should be kept on hardware wallets.

Development
-----------

Note: it's advised to use the deployment code in `money-market`. This code will merge the configuration of the price oracle with the money market itself.

For local development need a private key and address pair for the "poster."

```bash
compound-oracle> scripts/blockchain/deploy development <poster-address> # deploys price oracle to local ganache
```

This will deploy the price oracle and print its location to the console. That address will also be available in `networks/development.json`.

In your money market, you'll need to set this new oracle as the price oracle:

```bash
compound-money-market> scripts/blockchain/set-oracle <price-oracle-address>
```

Discussion
----------

For any concerns with the protocol, open an issue or visit us on [Discord](https://discordapp.com/invite/874ntdw) to discuss.

For security concerns, please email [security@compound.finance](mailto:security@compound.finance).

_© Copyright 2018, Compound Labs_
