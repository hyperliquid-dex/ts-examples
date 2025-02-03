import { encode } from "@msgpack/msgpack";
import { Hex, PrivateKeyAccount, keccak256 } from "viem";

type Signature = {
  r: string;
  s: string;
  v: number;
};

const IS_MAINNET = true; // switch this to false to sign for testnet
const phantomDomain = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000" as const,
};
const agentTypes = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

export async function signStandardL1Action(
  action: unknown,
  wallet: PrivateKeyAccount,
  vaultAddress: string | null,
  nonce: number
): Promise<Signature> {
  const phantomAgent = {
    source: IS_MAINNET ? "a" : "b", 
    connectionId: hashAction(
      action,
      vaultAddress,
      nonce
    ),
  };
  const payloadToSign = {
    domain: phantomDomain,
    types: agentTypes,
    primaryType: "Agent",
    message: phantomAgent,
  } as const;
  const signedAgent = await wallet.signTypedData(payloadToSign);
  return splitSig(signedAgent);
}

function hashAction(
  action: unknown,
  vaultAddress: string | null,
  nonce: number
): Hex {
  const msgPackBytes = encode(action);
  console.log("action hash", Buffer.from(msgPackBytes).toString("base64"));
  const additionalBytesLength = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce));
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    data.set(addressToBytes(vaultAddress), msgPackBytes.length + 9);
  }
  return keccak256(data);
}

function addressToBytes(address: string): Uint8Array {
  const hex = address.startsWith("0x") ? address.substring(2) : address;
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function splitSig(sig: string): Signature {
  sig = sig.slice(2);
  if (sig.length !== 130) {
    throw new Error(`bad sig length: ${sig.length}`);
  }
  const vv = sig.slice(-2);

  // Ledger returns 0/1 instead of 27/28, so we accept both
  if (vv !== "1c" && vv !== "1b" && vv !== "00" && vv !== "01") {
    throw new Error(`bad sig v ${vv}`);
  }
  const v = vv === "1b" || vv === "00" ? 27 : 28;
  const r = "0x" + sig.slice(0, 64);
  const s = "0x" + sig.slice(64, 128);
  return { r, s, v };
}