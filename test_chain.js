const { Blockchain, Transaction, PolChain } = require('./blockchain.js')
const EC = require('elliptic').ec;
const ec = new EC('secp256k1')

const MINT_KEY_PAIR = ec.keyFromPrivate("0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e", "hex");
const MINT_PUBLIC_ADDRESS = "049245c3867215b8f4277c15a9bffee568dc4f5cb2c393f4b1263780aa5a4df0640c036dd69a1c93e5c189a28cbc6781aa6b87dc25be27e5bea0f1bcf25be7efcb";

const myKey = ec.keyFromPrivate('275d7d634cf9229b955094f17847b64762d9bd528b5ba6082ba64eb1fb1d2988')
const myWalletAddress = myKey.getPublic('hex')
const toKey = ec.keyFromPrivate('0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e')
const toWalletAddress = toKey.getPublic('hex')

const tx1 = new Transaction(MINT_PUBLIC_ADDRESS, myWalletAddress, 1)
tx1.sign(MINT_KEY_PAIR)

PolChain.addTransaction(tx1)

PolChain.mineTransactions()


console.log('\nBalance of eriqo is', PolChain.getBalance(myWalletAddress))
console.log('\nBalance of mint is', PolChain.getBalance(MINT_PUBLIC_ADDRESS))

console.log(PolChain.getLastBlock())

