import { ethers } from 'ethers';
import { keccak256 } from 'ethers'
import { encode } from '@msgpack/msgpack';
import { Decimal } from 'decimal.js';

// Types
type Tif = 'Alo' | 'Ioc' | 'Gtc';
type Tpsl = 'tp' | 'sl';

interface LimitOrderType {
    tif: Tif;
}

interface TriggerOrderType {
    triggerPx: number;
    isMarket: boolean;
    tpsl: Tpsl;
}

interface TriggerOrderTypeWire {
    triggerPx: string;
    isMarket: boolean;
    tpsl: Tpsl;
}

interface OrderType {
    limit?: LimitOrderType;
    trigger?: TriggerOrderType;
}

interface OrderTypeWire {
    limit?: LimitOrderType;
    trigger?: TriggerOrderTypeWire;
}

export interface OrderRequest {
    coin: string;
    is_buy: boolean;
    sz: number;
    limit_px: number;
    order_type: OrderType;
    reduce_only: boolean;
    cloid?: Cloid | null;
}

type OidOrCloid = number | Cloid;

interface ModifyRequest {
    oid: OidOrCloid;
    order: OrderRequest;
}

interface CancelRequest {
    coin: string;
    oid: number;
}

interface CancelByCloidRequest {
    coin: string;
    cloid: Cloid;
}

type Grouping = 'na' | 'normalTpsl' | 'positionTpsl';

interface Order {
    asset: number;
    isBuy: boolean;
    limitPx: number;
    sz: number;
    reduceOnly: boolean;
    cloid: Cloid | null;
}

interface OrderWire {
    a: number;
    b: boolean;
    p: string;
    s: string;
    r: boolean;
    t: OrderTypeWire;
    c?: string;
}

interface ModifyWire {
    oid: number;
    order: OrderWire;
}

interface ScheduleCancelAction {
    type: 'scheduleCancel';
    time?: number | null;
}

class Cloid {
    private _rawCloid: string;

    constructor(rawCloid: string) {
        this._rawCloid = rawCloid;
        this._validate();
    }

    private _validate(): void {
        if (!this._rawCloid.startsWith('0x')) {
            throw new Error('cloid is not a hex string');
        }
        if (this._rawCloid.slice(2).length !== 32) {
            throw new Error('cloid is not 16 bytes');
        }
    }

    static fromInt(cloid: number): Cloid {
        return new Cloid(`0x${cloid.toString(16).padStart(32, '0')}`);
    }

    static fromStr(cloid: string): Cloid {
        return new Cloid(cloid);
    }

    toRaw(): string {
        return this._rawCloid;
    }
}

export function orderTypeToWire(orderType: OrderType): OrderTypeWire {
    if ('limit' in orderType) {
        return { limit: orderType.limit };
    } else if ('trigger' in orderType && orderType.trigger) {
        return {
            trigger: {
                isMarket: orderType.trigger.isMarket,
                triggerPx: floatToWire(orderType.trigger.triggerPx),
                tpsl: orderType.trigger.tpsl,
            }
        };
    }
    throw new Error('Invalid order type');
}

export function addressToBytes(address: string): Buffer {
    return Buffer.from(address.startsWith('0x') ? address.slice(2) : address, 'hex');
}

export function actionHash(action: any, vaultAddress: string | null, nonce: number): Buffer {
    const nonceBytes = nonceToBytes(nonce);

    const data = Buffer.concat([
        Buffer.from(encode(action)),
        nonceBytes,
        vaultAddress === null
            ? Buffer.from([0])
            : Buffer.concat([
                Buffer.from([1]),
                addressToBytes(vaultAddress)
            ])
    ]);

    return Buffer.from(keccak256(data).slice(2), 'hex');
}

function nonceToBytes(nonce: number): Buffer {
    const buffer = Buffer.alloc(8);
    const bigIntNonce = BigInt(nonce);
    buffer.writeBigUInt64BE(bigIntNonce, 0);
    return buffer;
}
export function constructPhantomAgent(hash: Buffer, isMainnet: boolean) {
    return {
        source: isMainnet ? 'a' : 'b',
        connectionId: hash
    };
}

export async function signL1Action(
    wallet: ethers.Wallet,
    action: any,
    activePool: string | null,
    nonce: number,
    isMainnet: boolean
) {
    const hash = actionHash(action, activePool, nonce);
    const phantomAgent = constructPhantomAgent(hash, isMainnet);

    const domain = {
        name: 'Exchange',
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    const types = {
        Agent: [
            {name: 'source', type: 'string'},
            {name: 'connectionId', type: 'bytes32'}
        ]
    };

    const signature = await wallet.signTypedData(
        domain,
        types,
        phantomAgent
    );

    const sig = ethers.Signature.from(signature);

    return {
        r: sig.r,
        s: sig.s,
        v: sig.v
    };
}

export function floatToWire(x: number): string {
    const rounded = x.toFixed(8);
    if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
        throw new Error('floatToWire causes rounding');
    }
    if (rounded === '-0') {
        return '0';
    }
    return new Decimal(rounded).toString();
}

export function floatToIntForHashing(x: number): number {
    return floatToInt(x, 8);
}

export function floatToUsdInt(x: number): number {
    return floatToInt(x, 6);
}

export function floatToInt(x: number, power: number): number {
    const withDecimals = x * Math.pow(10, power);
    if (Math.abs(Math.round(withDecimals) - withDecimals) >= 1e-3) {
        throw new Error('floatToInt causes rounding');
    }
    return Math.round(withDecimals);
}

export function getTimestampMs(): number {
    return Date.now();
}

export function orderRequestToOrderWire(order: OrderRequest, asset: number): OrderWire {
    const orderWire: OrderWire = {
        a: asset,
        b: order.is_buy,
        p: floatToWire(order.limit_px),
        s: floatToWire(order.sz),
        r: order.reduce_only,
        t: orderTypeToWire(order.order_type)
    };

    if (order.cloid) {
        orderWire.c = order.cloid.toRaw();
    }

    return orderWire;
}

export function orderWiresToOrderAction(orderWires: OrderWire[]) {
    return {
        type: 'order',
        orders: orderWires,
        grouping: 'na' as const
    };
}