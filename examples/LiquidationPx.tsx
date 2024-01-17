// This snippet shows a function that can be used to compute the 
// cross liquidation price given order inputs and market data.

enum Side {
  Bid,
  Ask,
}

export type Leverage = CrossLeverage | IsolatedLeverage;
type CrossLeverage = {
  type: "cross";
  value: number;
};
export type IsolatedLeverage = {
  type: "isolated";
  value: number;
  rawUsd: number;
};
export type LeverageType = Leverage["type"];

export interface Position {
  coin: string;
  szi: number;
  leverage: Leverage;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  liquidationPx: number | null;
  marginUsed: number;
  maxLeverage: number;
}

export type AssetPosition = { type: "oneWay"; position: Position };

export interface Meta {
  universe: Array<AssetInfo>;
}

export interface AssetInfo {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
}

interface MarginSummary {
  accountValue: number;
  totalNtlPos: number;
  totalRawUsd: number;
  totalMarginUsed: number;
}

export interface ClearinghouseState {
  assetPositions: Array<AssetPosition>;
  crossMarginSummary: MarginSummary;
  crossMaintenanceMarginUsed: number;
}

export interface WebData {
  clearinghouseState: ClearinghouseState;
  meta: Meta;
  assetCtxs: Array<AssetCtx>;
}

interface AssetCtx {
  dayNtlVlm: number;
  funding: number;
  openInterest: number;
  prevDayPx: number;
  oraclePx: number;
  markPx: number;
}

function parseSide(isBuy: boolean): any {
  if (isBuy) {
    return {
      name: "Long",
      side: Side.Bid,
      floatSide: 1,
    };
  }

  return {
    name: "Short",
    side: Side.Ask,
    floatSide: -1,
  };
}

const FLOAT_REGEX = /^-?(?!0\d)\d+(?:\.\d*)?$/;
const KEYS_TO_SKIP = ["displayName", "name"];
function parseJsonUnquotingFloatString(s: string) {
  const convertFloatStringsToNumbers = function (obj: any): any {
    if (typeof obj === "object" && obj !== null) {
      for (const key in obj) {
        if (KEYS_TO_SKIP.includes(key)) {
          continue;
        }
        obj[key] = convertFloatStringsToNumbers(obj[key]);
      }
    } else if (typeof obj === "string" && obj.match(FLOAT_REGEX)) {
      return parseFloat(obj);
    }
    return obj;
  };
  return convertFloatStringsToNumbers(JSON.parse(s));
}

const COIN_NOT_FOUND = 1000000;
function coinToAsset(coin: string, universe: Array<AssetInfo>): number {
  for (let i = 0; i < universe.length; ++i) {
    if (universe[i]?.name === coin) {
      return i;
    }
  }
  return COIN_NOT_FOUND;
}

function coinPosition(
  coin: string,
  assetPositions: Array<AssetPosition>
): Position | undefined {
  for (let i = 0; i < assetPositions.length; ++i) {
    if (assetPositions[i]?.position.coin === coin) {
      return assetPositions[i]?.position;
    }
  }
  return undefined;
}

function getCrossLiquidationPrice(
  markPx: number,
  floatSide: number,
  liveAccountValue: number,
  totalNtlPos: number,
  absPosition: number,
  maxLeverage: number
): number | null {
  const correction = 1 - floatSide / maxToMaintenanceLeverage(maxLeverage);
  const liquidationPrice =
    markPx -
    (floatSide *
      (liveAccountValue -
        totalNtlPos / maxToMaintenanceLeverage(maxLeverage))) /
      absPosition /
      correction;

  if (liquidationPrice <= 0 || liquidationPrice > 1e15 || absPosition === 0) {
    return null;
  } else {
    return liquidationPrice;
  }
}

function maxToMaintenanceLeverage(maxLeverage: number): number {
  return maxLeverage * 2;
}

async function estimatedLiqPxAndExplanationExample(
  address: string,
  mid: number,
  leverage: number,
  userSz: number,
  userLimitPx: number,
  isBuyOrder: boolean,
  activeCoin: string
) {
  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: `{"type":"webData2","user":"${address}"}`,
  };
  const url = "https://api-ui.hyperliquid-testnet.xyz/info";
  const resp = await fetch(url, request);

  const webData: WebData = parseJsonUnquotingFloatString(await resp.text());
  const {
    clearinghouseState: { assetPositions },
    meta,
    assetCtxs,
  } = webData;

  const asset = coinToAsset(activeCoin, meta.universe);
  const position = coinPosition(activeCoin, assetPositions);

  const assetCtx = assetCtxs[asset];
  const maxLeverage =
    position?.maxLeverage ?? meta.universe[asset]?.maxLeverage;
  if (
    assetCtx === undefined ||
    maxLeverage === undefined ||
    leverage === null
  ) {
    console.log(
      "Missing data for liquidation px, returning null",
      mid,
      assetCtx,
      maxLeverage,
      leverage,
      asset
    );
    return null;
  }
  const szi = position?.szi ?? 0;
  const { accountValue } = webData.clearinghouseState.crossMarginSummary;
  const crossMaintenanceMarginUsed =
    webData.clearinghouseState.crossMaintenanceMarginUsed;

  const { floatSide } = parseSide(isBuyOrder);

  const updatedPosition = szi + floatSide * userSz;
  const absUpdatedPosition = Math.abs(updatedPosition);
  let markPx = assetCtx["markPx"];

  const crossMaintenanceMarginRemaining =
    accountValue -
    crossMaintenanceMarginUsed +
    (Math.abs(szi) * markPx) / maxToMaintenanceLeverage(maxLeverage);

  if (userLimitPx > markPx !== isBuyOrder) {
    markPx = userLimitPx;
  }
  const totalNtlPos = userLimitPx * absUpdatedPosition;
  const { floatSide: positionSide } = parseSide(updatedPosition > 0);

  const liqPx = getCrossLiquidationPrice(
    markPx,
    positionSide,
    Math.max(crossMaintenanceMarginRemaining, totalNtlPos / leverage),
    totalNtlPos,
    absUpdatedPosition,
    maxLeverage
  );

  console.log("liquidation px:", liqPx);
}
