import { ethers } from 'ethers';
import {OrderRequest, orderRequestToOrderWire, orderWiresToOrderAction, signL1Action} from "./signing";
import axios from "axios";

const wallet = new ethers.Wallet("your-secret-key");

const orderRequest: OrderRequest = {
    coin: "BTC",
    is_buy: true,
    sz: 0.001,
    limit_px: 90000,
    reduce_only: false,
    order_type: {
        limit: { tif: "Gtc" }  // Gtc: Good till Cancel
    }
};
const assetId = 0
const activePool = null
const nonce = Date.now()
const isMainnet = true

const orderWire = orderRequestToOrderWire(orderRequest, assetId);


const orderAction = orderWiresToOrderAction([orderWire]);


async function signingTest(){

    const signature = await signL1Action(
        wallet,
        orderAction,
        activePool,
        nonce,
        isMainnet
    );
    const requestData = {
        action: {
            type: "order",
            orders: [
                {
                    a: assetId, // Replace with actual asset ID or number
                    b: true, // true for buy, false for sell
                    p: "90000", // Replace with price
                    s: "0.001", // Replace with size
                    r: false, // true if reduceOnly
                    t: {
                        limit: {
                            tif: "Gtc", // Replace with "Alo", "Ioc", or "Gtc"
                        },
                    },
                },
            ],
            grouping: "na", // Replace with "na", "normalTpsl", or "positionTpsl"
        },
        nonce: nonce, // Current timestamp in milliseconds
        signature: signature,
    };


    const res = await axios.post("https://api.hyperliquid.xyz/exchange", requestData, {headers: {
            "Content-Type": "application/json",}});

    console.log(res.data)
}

signingTest();