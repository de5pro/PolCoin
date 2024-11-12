require('dotenv').config();
const WS = require("ws");
const { Blockchain, Transaction, Block, PolChain } = require('./blockchain.js');
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const cron = require('node-cron');

const WS_PORT = process.env.WS_PORT || 6001;
const PEERS = process.env.PEERS ? process.env.PEERS.split(',') : [];

const MY_ADDRESS = `ws://localhost:${WS_PORT}`;
const MINT_PUBLIC_ADDRESS = process.env.MINT_PUBLIC_ADDRESS || "Unauthorized";

const server = new WS.Server({ port: WS_PORT });

let opened = [], connected = [];
let check = [];
let checked = [];
let checking = false;
let tempChain = new Blockchain();

console.log("This PolChain node is listening on PORT", WS_PORT);

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        console.log(_message);

        switch(_message.type) {
            case "TYPE_UPDATE_CHAIN":
                const [ newBlock, newDiff ] = _message.data;

                const ourTx = [...PolChain.transactions.map(tx => JSON.stringify(tx))];
                const theirTx = [...newBlock.data.filter(tx => tx.from !== MINT_PUBLIC_ADDRESS).map(tx => JSON.stringify(tx))];
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


cron.schedule('*/10 * * * * *', () => {
    if (PolChain.transactions.length !== 0) {
        console.log(`${new Date().toLocaleString()} | Pending Transaction(s) found mining block...`);
        PolChain.mineTransactions();
        console.log(`${new Date().toLocaleString()} | Block successfully mined...`);
        sendMessage(produceMessage("TYPE_UPDATE_CHAIN", [
            PolChain.getLastBlock(),
            PolChain.difficulty
        ]))
        PolChain.transactions = [];
    }else{
        console.log(`${new Date().toLocaleString()} | No pending transaction(s) found...`);
    }
});

cron.schedule('* * * * *', () => {
    console.log(`${new Date().toLocaleString()} | Printing results every minute...`);
    console.log("\n\n\n========================= RESULTS =========================\n");
	console.log(PolChain);
});