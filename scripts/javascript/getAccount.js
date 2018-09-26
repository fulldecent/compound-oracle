const Web3 = require('web3');

const web3 = new Web3(process.env.PROVIDER || 'http://localhost:8545');

web3.eth.getAccounts().then((acc) => console.log(acc[0]));