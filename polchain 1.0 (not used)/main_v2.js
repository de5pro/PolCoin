const { Blockchain, Transaction } = require('./blockchain.js')
const EC = require('elliptic').ec;
const ec = new EC('secp256k1')

const myKey = ec.keyFromPrivate('275d7d634cf9229b955094f17847b64762d9bd528b5ba6082ba64eb1fb1d2988')
const myWalletAddress = myKey.getPublic('hex')

let polCoin = new Blockchain()

const tx1 = new Transaction(myWalletAddress, 'public key goes here', 10)
tx1.signTransaction(myKey)
polCoin.addTransaction(tx1)

console.log('\nStarting the miner...')
polCoin.minePendingTransactions(myWalletAddress)

console.log('\nBalance of eriqo is', polCoin.getBalanceOfAddress(myWalletAddress))

console.log('\nAfter mined...')
polCoin.minePendingTransactions(myWalletAddress)

console.log('\nBalance of eriqo is', polCoin.getBalanceOfAddress(myWalletAddress))
