const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Block {
    constructor(timestamp = Date.now().toString(), data = []) {
        this.timestamp = timestamp;
        this.data = data;
        this.prevHash = "";
        this.hash = Block.getHash(this);
        this.nonce = 0;
    }

    static getHash(block) {
        return SHA256(block.prevHash + block.timestamp + JSON.stringify(block.data) + block.nonce);
    }

    mine(difficulty) {
        while (!this.hash.startsWith(Array(difficulty + 1).join("0"))) {
            this.nonce++;
            this.hash = Block.getHash(this);
        }
    }

    static hasValidTransactions(block, chain) {
        return (
            block.data.every(transaction => Transaction.isValid(transaction, chain))
        );
    }
}

class Blockchain {
    constructor() {
        const initalCoinRelease = new Transaction("GENESIS_BLOCK", MINT_PUBLIC_ADDRESS, 10000000);
        initalCoinRelease.sign(MINT_KEY_PAIR);
        this.transactions = [];
        this.chain = [new Block("0", [initalCoinRelease])];
        this.difficulty = 1;
        this.reward = 0;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(block) {
        block.prevHash = this.getLastBlock().hash;
        block.hash = Block.getHash(block);
        block.mine(this.difficulty);
        this.chain.push(Object.freeze(block));
    }

    addTransaction(transaction) {
        if (Transaction.isValid(transaction, this)) {
            this.transactions.push(transaction);
        }
    }

    mineTransactions() {
        // const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, rewardAddress, this.reward);
        // rewardTransaction.sign(MINT_KEY_PAIR);

        const blockTransactions = [...this.transactions];

        if (blockTransactions.length > 0) this.addBlock(new Block(Date.now().toString(), blockTransactions));

        this.transactions.splice(0, blockTransactions.length - 1);
    }

    getBalance(address) {
        let balance = 0;

        this.chain.forEach(block => {
            block.data.forEach(transaction => {
                if (transaction.from === address) {
                    balance -= transaction.amount;
                }

                if (transaction.to === address) {
                    balance += transaction.amount;
                }
            })
        })

        return balance;
    }

    static isValid(blockchain) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const prevBlock = blockchain.chain[i-1];

            if (
                currentBlock.hash !== Block.getHash(currentBlock) || 
                prevBlock.hash !== currentBlock.prevHash || 
                !Block.hasValidTransactions(currentBlock, blockchain)
            ) {
                return false;
            }
        }

        return true;
    }
}

class Transaction { 
    constructor(from, to, amount) { 
        this.from = from; 
        this.to = to; 
        this.amount = amount; 
    } 
 
    sign(keyPair) { 
        if (keyPair.getPublic("hex") === this.from) { 
            this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount), "base64").toDER("hex"); 
        } 
    } 
 
    static isValid(tx, chain) { 
        return ( 
            tx.from && 
            tx.to && 
            tx.amount && 
            (chain.getBalance(tx.from) >= tx.amount || tx.from === MINT_PUBLIC_ADDRESS) &&
            ec.keyFromPublic(tx.from, "hex").verify(SHA256(tx.from + tx.to + tx.amount), tx.signature)
        )
    }
} 

const PolChain = new Blockchain();

module.exports = { Block, Transaction, Blockchain, PolChain };