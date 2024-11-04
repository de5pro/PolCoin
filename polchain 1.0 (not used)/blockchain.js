const SHA256 = require('crypto-js/sha256');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

class Block {
    constructor(timestamp, transactions, previousHash = '') {
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.nonce = 0;
        this.hash = Block.getHash(this);
    }

    static getHash(block) {
        return SHA256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString();
    }

    mineBlock(difficulty) {
        const target = Array(difficulty + 1).join("0");
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = Block.getHash(this);
        }
        // console.log("Block mined: " + this.hash);
    }

    static hasValidTransactions(block) {
        for (const tx of block.transactions) {
            if (!Transaction.isValid(tx)) {
                return false;
            }
        }
        return true;
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 2;
        this.pendingTransactions = [];
        this.miningReward = 100;
    }

    createGenesisBlock() {
        return new Block(new Date().toLocaleDateString(), "Genesis Block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    minePendingTransactions(miningRewardAddress) {
        let block = new Block(Date.now(), this.pendingTransactions, this.getLatestBlock().hash);
        block.mineBlock(this.difficulty);

        // console.log('Block successfully mined!');
        this.chain.push(block);

        // Reset pending transactions and include the mining reward
        this.pendingTransactions = [
            new Transaction(null, miningRewardAddress, this.miningReward)
        ];
    }

    addTransaction(transaction) {
        if (!transaction.fromAddress || !transaction.toAddress) {
            throw new Error('Transaction must include from and to address');
        }
        if (!Transaction.isValid(transaction)) {
            throw new Error('Cannot add invalid transaction to chain');
        }
        this.pendingTransactions.push(transaction);
    }

    getBalanceOfAddress(address) {
        let balance = 0;
        for (const block of this.chain) {
            for (const trans of block.transactions) {
                if (trans.fromAddress === address) {
                    balance -= trans.amount;
                }
                if (trans.toAddress === address) {
                    balance += trans.amount;
                }
            }
        }
        return balance;
    }

    static isChainValid(blockchain) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const previousBlock = blockchain.chain[i - 1];

            // Check if the current block has valid transactions
            if (!Block.hasValidTransactions(currentBlock)) {
                return false;
            }

            // Check if the hash is correct
            if (currentBlock.hash !== currentBlock.constructor.getHash(currentBlock)) {
                return false;
            }

            // Check if the previous hash is correct
            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }
}

class Transaction {
    constructor(fromAddress, toAddress, amount) {
        this.fromAddress = fromAddress;
        this.toAddress = toAddress;
        this.amount = amount;
    }

    calculateHash() {
        return SHA256(this.fromAddress + this.toAddress + this.amount).toString();
    }

    signTransaction(signingKey) {
        if (signingKey.getPublic('hex') !== this.fromAddress) {
            throw new Error('You cannot sign transactions for other wallets!');
        }
        const hashTx = this.calculateHash();
        const sig = signingKey.sign(hashTx, 'base64');
        this.signature = sig.toDER('hex'); // Ensure signature is in the correct format
    }    

    static isValid(tx) {
        if (tx.fromAddress === null) return true; // Allow mining rewards (transactions without a sender)
        if (!tx.signature || tx.signature.length === 0) {
            throw new Error('No signature in this transaction');
        }
        const publicKey = ec.keyFromPublic(tx.fromAddress, 'hex');
        console.log(tx);
        const hashTx = SHA256(tx.fromAddress + tx.toAddress + tx.amount).toString(); // Use the hash from the transaction
        const isVerified = publicKey.verify(hashTx, tx.signature);
        return isVerified;
    }
    
}

const PolChain = new Blockchain();

module.exports = { Block, Transaction, Blockchain, PolChain };
