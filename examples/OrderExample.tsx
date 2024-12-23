import { ethers } from "ethers";
import axios from "axios";
import { Decimal } from "decimal.js";
import { signStandardL1Action } from "./signings";
import { privateKeyToAccount } from "viem/accounts";

type Tif = "Alo" | "Ioc" | "Gtc";
type Tpsl = "tp" | "sl";

interface LimitOrderType {
  tif: Tif;
}

interface TriggerOrderTypeWire {
  triggerPx: string;
  isMarket: boolean;
  tpsl: Tpsl;
}

interface OrderTypeWire {
  limit?: LimitOrderType;
  trigger?: TriggerOrderTypeWire;
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

interface TriggerOrderType {
  triggerPx: number;
  isMarket: boolean;
  tpsl: Tpsl;
}

interface OrderType {
  limit?: LimitOrderType;
  trigger?: TriggerOrderType;
}

class Cloid {
  private _rawCloid: string;

  constructor(rawCloid: string) {
    this._rawCloid = rawCloid;
    this._validate();
  }

  private _validate(): void {
    if (!this._rawCloid.startsWith("0x")) {
      throw new Error("cloid is not a hex string");
    }
    if (this._rawCloid.slice(2).length !== 32) {
      throw new Error("cloid is not 16 bytes");
    }
  }

  static fromInt(cloid: number): Cloid {
    return new Cloid(`0x${cloid.toString(16).padStart(32, "0")}`);
  }

  static fromStr(cloid: string): Cloid {
    return new Cloid(cloid);
  }

  toRaw(): string {
    return this._rawCloid;
  }
}

interface OrderRequest {
  coin: string;
  is_buy: boolean;
  sz: number;
  limit_px: number;
  order_type: OrderType;
  reduce_only: boolean;
  cloid?: Cloid | null;
}

function floatToWire(x: number): string {
  const rounded = x.toFixed(8);
  if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
    throw new Error("floatToWire causes rounding");
  }
  if (rounded === "-0") {
    return "0";
  }
  return new Decimal(rounded).toString();
}

function orderTypeToWire(orderType: OrderType): OrderTypeWire {
  if ("limit" in orderType) {
    return { limit: orderType.limit };
  } else if ("trigger" in orderType && orderType.trigger) {
    return {
      trigger: {
        isMarket: orderType.trigger.isMarket,
        triggerPx: floatToWire(orderType.trigger.triggerPx),
        tpsl: orderType.trigger.tpsl,
      },
    };
  }
  throw new Error("Invalid order type");
}

const orderRequest: OrderRequest = {
  coin: "BTC",
  is_buy: true,
  sz: 0.001,
  limit_px: 90000,
  reduce_only: false,
  order_type: {
    limit: { tif: "Gtc" }, // Gtc: Good till Cancel
  },
};

const assetId = 0;
const activePool = null;
const wallet = privateKeyToAccount("0x-your-secret-key");
const nonce = Date.now();
const orderWire = orderRequestToOrderWire(orderRequest, assetId);
const orderAction = orderWiresToOrderAction([orderWire]);

function orderRequestToOrderWire(
  order: OrderRequest,
  asset: number,
): OrderWire {
  const orderWire: OrderWire = {
    a: asset,
    b: order.is_buy,
    p: floatToWire(order.limit_px),
    s: floatToWire(order.sz),
    r: order.reduce_only,
    t: orderTypeToWire(order.order_type),
  };

  if (order.cloid) {
    orderWire.c = order.cloid.toRaw();
  }

  return orderWire;
}

function orderWiresToOrderAction(orderWires: OrderWire[]) {
  return {
    type: "order",
    orders: orderWires,
    grouping: "na" as const,
  };
}

async function orderExample() {
  const signature = await signStandardL1Action(
    orderAction,
    wallet,
    activePool,
    nonce,
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

  const res = await axios.post(
    "https://api.hyperliquid.xyz/exchange",
    requestData,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  console.log(res.data);
}

orderExample();
