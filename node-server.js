const WS = require("ws");
const { Blockchain, Transaction, Block, PolChain } = require('./blockchain.js');
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const cron = require('node-cron');
const express = require('express');

// Express server setup for HTTP API
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const HTTP_PORT = 5000; // Choose any port for the HTTP server

const MINT_PUBLIC_ADDRESS = "049245c3867215b8f4277c15a9bffee568dc4f5cb2c393f4b1263780aa5a4df0640c036dd69a1c93e5c189a28cbc6781aa6b87dc25be27e5bea0f1bcf25be7efcb";
const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e"; // put in .env file later

const PORT = 3000;
const PEERS = [];
const MY_ADDRESS = "ws://localhost:3000";
const server = new WS.Server({ port: PORT });

let opened = [], connected = [];
let check = [];
let checked = [];
let checking = false;
let tempChain = new Blockchain();

console.log("This PolChain node is listening on PORT", PORT);

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        console.log(_message);

        switch(_message.type) {
            case "TYPE_UPDATE_CHAIN":
                const [ newBlock, newDiff ] = _message.data;

                const ourTx = [...PolChain.transactions.map(tx => JSON.stringify(tx))];
                const theirTx = [...newBlock.data.map(tx => JSON.stringify(tx))];
                const n = theirTx.length;

                if (newBlock.prevHash !== PolChain.getLastBlock().prevHash) {
                    for (let i = 0; i < n; i++) {
                        const index = ourTx.indexOf(theirTx[0]);

                        if (index === -1) break;
                        
                        ourTx.splice(index, 1);
                        theirTx.splice(0, 1);
                    }

                    if (
                        theirTx.length === 0 &&
                        SHA256(PolChain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash &&
                        newBlock.hash.startsWith(Array(PolChain.difficulty + 1).join("0")) &&
                        Block.hasValidTransactions(newBlock, PolChain) &&
                        (parseInt(newBlock.timestamp) > parseInt(PolChain.getLastBlock().timestamp) || PolChain.getLastBlock().timestamp === "") &&
                        parseInt(newBlock.timestamp) < Date.now() &&
                        PolChain.getLastBlock().hash === newBlock.prevHash
                    ) {
                        PolChain.chain.push(newBlock);
                        PolChain.difficulty = newDiff;
                        PolChain.transactions = [...ourTx.map(tx => JSON.parse(tx))];
                    }
                } else if (!checked.includes(JSON.stringify([newBlock.prevHash, PolChain.chain[PolChain.chain.length-2].timestamp || ""]))) {
                    // Case to prevent racing conditions for block to be added
                    checked.push(JSON.stringify([PolChain.getLastBlock().prevHash, PolChain.chain[PolChain.chain.length-2].timestamp || ""]));
                    const position = PolChain.chain.length - 1;

                    checking = true;

                    sendMessage(produceMessage("TYPE_REQUEST_CHECK", MY_ADDRESS));

                    setTimeout(() => {
                        checking = false;

                        let mostAppeared = check[0];

                        check.forEach(group => {
                            if (check.filter(_group => _group === group).length > check.filter(_group => _group === mostAppeared).length) {
                                mostAppeared = group;
                            }
                        })

                        const group = JSON.parse(mostAppeared)

                        PolChain.chain[position] = group[0];
                        PolChain.transactions = [...group[1]];
                        PolChain.difficulty = group[2];

                        check.splice(0, check.length);
                    }, 5000);
                }

                break;

            case "TYPE_REQUEST_CHECK":
                opened.filter(node => node.address === _message.data)[0].socket.send(
                    JSON.stringify(produceMessage(
                        "TYPE_SEND_CHECK",
                        JSON.stringify([PolChain.getLastBlock(), PolChain.transactions, PolChain.difficulty])
                    ))
                );

                break;

            case "TYPE_SEND_CHECK":
                if (checking) check.push(_message.data);

                break;

            case "TYPE_CREATE_TRANSACTION":
                const transaction = _message.data;

                PolChain.addTransaction(transaction);

                break;

            case "TYPE_SEND_CHAIN":
                const { block, finished } = _message.data;

                if (!finished) {
                    tempChain.chain.push(block);
                } else {
                    tempChain.chain.push(block);
                    if (Blockchain.isValid(tempChain)) {
                        PolChain.chain = tempChain.chain;
                    }
                    tempChain = new Blockchain();
                }

                break;

            case "TYPE_REQUEST_CHAIN":
                const socket = opened.filter(node => node.address === _message.data)[0].socket;
                for (let i = 1; i < PolChain.chain.length; i++) {
                    socket.send(JSON.stringify(produceMessage(
                        "TYPE_SEND_CHAIN",
                        {
                            block: PolChain.chain[i],
                            finished: i === PolChain.chain.length - 1
                        }
                    )));
                }

                break;

            case "TYPE_REQUEST_INFO":
                opened.filter(node => node.address === _message.data)[0].socket.send(JSON.stringify(produceMessage(
                    "TYPE_SEND_INFO",
                    [PolChain.difficulty, PolChain.transactions]
                )));

                break;

            case "TYPE_SEND_INFO":
                [ PolChain.difficulty, PolChain.transactions ] = _message.data;
                
                break;

            case "TYPE_HANDSHAKE":
                const nodes = _message.data;

                nodes.forEach(node => connect(node))
        }
    });
})

async function connect(address) {
	if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
		const socket = new WS(address);

		socket.on("open", () => {
			socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [MY_ADDRESS, ...connected])));

			opened.forEach(node => node.socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [address]))));

			if (!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
				opened.push({ socket, address });
			}

			if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
				connected.push(address);
			}
		});

		socket.on("close", () => {
			opened.splice(connected.indexOf(address), 1);
			connected.splice(connected.indexOf(address), 1);
		});
	}
}

function produceMessage(type, data) {
	return { type, data };
}

function sendMessage(message) {
	opened.forEach(node => {
		node.socket.send(JSON.stringify(message));
	})
}

process.on("uncaughtException", err => console.log(err));

PEERS.forEach(peer => connect(peer));

// API to generate a new wallet
app.post('/generateNewWallet', (req, res) => {
    const { npm, password } = req.body;

    // Validate input
    if (!npm || !password) {
        return res.status(400).json({ error: 'npm and password are required.' });
    }

    /*
        ADD DATABASE LOGIC HERE TO STORE AND VALIDATE THE NPM AND PASSWORD
    */

    // Generate key pair
    const keyPair = ec.genKeyPair();
    const privateKey = keyPair.getPrivate('hex');
    const publicKey = keyPair.getPublic('hex');

    // Return the generated keys
    res.status(200).json({
        message: 'Keys generated successfully',
        npm,
        publicKey,
        privateKey
    });
});

// API to validate new wallet
app.post('/validateNewWallet', (req, res) => {
    try {
        const { npm, password, publicKey } = req.body;

        // Validate input
        if (!npm || !password || !publicKey) {
            return res.status(400).json({ error: 'npm, password, publicKey fields are required.' });
        }
        
        /*
            ADD DATABASE LOGIC HERE TO VALIDATE THE PUBLIC KEY
        */

        if(PolChain.getBalance(publicKey) > 0) {
            return res.status(400).json({ error: 'Wallet already validated.' });
        }

        // Create and sign the transaction
        const transaction = new Transaction(MINT_PUBLIC_ADDRESS, publicKey, Number(1));
        const key = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, 'hex');
        transaction.sign(key);

        // Add the transaction to the blockchain
        PolChain.addTransaction(transaction);

        // Broadcast to peers
        sendMessage(produceMessage('TYPE_CREATE_TRANSACTION', transaction));

        res.status(200).json({ message: 'New Wallet validated successfully', transaction });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while creating the transaction.' });
    }
});

// API to get wallet balance
app.post('/getWalletBalance', (req, res) => {
    const { publicKey } = req.body;

    // Validate input
    if (!publicKey) {
        return res.status(400).json({ error: 'Public key is required.' });
    }

    /*
        ADD DATABASE LOGIC HERE TO VALIDATE THE PUBLIC KEY
    */

    try {
        let balance = PolChain.getBalance(publicKey);
        res.status(200).json({ message: 'Wallet balance retrieved successfully', publicKey, balance });
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while retrieving the wallet balance.' });
    }
});

// API to get all transactions
app.get('/getAllBlocks', (req, res) => {
    try {
        const allBlocks = PolChain.chain.map(block => ({
            index: block.index,
            timestamp: block.timestamp,
            previousHash: block.prevHash,
            hash: block.hash,
            nonce: block.nonce,
            transactions: block.data
        }));

        res.status(200).json({ message: 'Blocks retrieved successfully', blocks: allBlocks });
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while retrieving the blocks.' });
    }
});

// API to create a transaction
app.post('/createTransaction', (req, res) => {
    try {
        const { fromAddress, toAddress, amount, privateKey } = req.body;

        // Validate input
        if (!fromAddress || !toAddress || !amount || !privateKey) {
            return res.status(400).json({ error: 'All transaction fields are required.' });
        }

        // Check if the private key is in valid hexadecimal format
        if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
            return res.status(400).json({ error: 'Invalid private key format. Must be a 64-character hexadecimal string.' });
        }
        
        // Ensure amount is a valid number
        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ error: 'Amount must be a positive number.' });
        }

        // Check if the fromAddress has enough balance
        const balance = PolChain.getBalance(fromAddress);
        if (Number(amount) > balance) {
            return res.status(400).json({ error: 'Insufficient balance to complete this transaction.' });
        }

        // Verify that the private key matches the fromAddress
        const key = ec.keyFromPrivate(privateKey, 'hex');
        const derivedPublicKey = key.getPublic('hex');
        if (derivedPublicKey !== fromAddress) {
            return res.status(400).json({ error: 'Private key does not match the provided fromAddress.' });
        }

        // Create and sign the transaction
        const transaction = new Transaction(fromAddress, toAddress, Number(amount));
        transaction.sign(key);
            

        // Add the transaction to the blockchain
        PolChain.addTransaction(transaction);

        // Broadcast to peers
        sendMessage(produceMessage('TYPE_CREATE_TRANSACTION', transaction));

        res.status(200).json({ message: 'Transaction created successfully', transaction });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while creating the transaction.' });
    }
});

// Start the Express server
app.listen(HTTP_PORT, () => {
    console.log("PolChain server is running on PORT", HTTP_PORT);
});