import axios from "axios";
import { Decimal } from "decimal.js";
import { signStandardL1Action } from "./Signing";
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
  asset: number;
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

function orderRequestToOrderWire(
  order: OrderRequest,
): OrderWire {
  const orderWire: OrderWire = {
    a: order.asset,
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
    grouping: "na",
  };
}

async function orderExample() {
  // You must set your private key before running this code.
  const PRIVATE_KEY = "0x-your-secret-key";
  if (!PRIVATE_KEY || PRIVATE_KEY === "0x-your-secret-key") {
    throw new Error("PRIVATE_KEY is not set. Please configure it.");
  }
  const wallet = privateKeyToAccount(PRIVATE_KEY);
  const vault_or_subaccount_address = null;
  const nonce = Date.now();

  const orderRequest: OrderRequest = {
    asset: 0, // BTC
    is_buy: true,
    sz: 0.001,
    limit_px: 90000,
    reduce_only: false,
    order_type: {
      limit: { tif: "Gtc" }, // Gtc: Good till Cancel
    },
  };
  const orderWire = orderRequestToOrderWire(orderRequest);
  const orderAction = orderWiresToOrderAction([orderWire]);

  const signature = await signStandardL1Action(
    orderAction,
    wallet,
    vault_or_subaccount_address,
    nonce,
  );

  const requestData = {
    action: orderAction,
    nonce: nonce, // Current timestamp in milliseconds
    signature: signature,
  };

  // WARNING: This sends an actual order on the mainnet.
  // If switching to the testnet, also update the endpoint in Signing.tsx.
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
