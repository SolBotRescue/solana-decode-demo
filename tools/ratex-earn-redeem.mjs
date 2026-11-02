#!/usr/bin/env node
/**
 * ratex-earn-redeem.mjs — build (and optionally simulate) a RateX EarnRedeem for an expired
 * PT position, without the RateX frontend.
 *
 * Why this exists: RateX's app is gone. The program is alive and the instruction is callable,
 * but the account list is easy to get wrong in a way that fails with an unrelated-looking
 * Anchor error. The layout below was taken verbatim from a real successful EarnRedeem
 * transaction, not inferred from a bundle, and it is verified by simulation.
 *
 *   node ratex-earn-redeem.mjs <market> <wallet>            # simulate, print the log
 *   node ratex-earn-redeem.mjs <market> <wallet> --json     # print a base64 tx for wallets
 *
 * Market keys: xSOL-2609, hyUSD-2609, ... (see MARKETS). Only expired markets redeem.
 * No dependencies beyond Node 18.
 */
import crypto from "crypto";
import fs from "fs";

const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const PROG = "rateqk9kmMstT8SdVDyiV81Wuv4snjYyBjYoPkGqywK";
const DISC = "5da23a014b12d442"; // global:earn_redeem
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_P = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYS = "11111111111111111111111111111111";
const PRICE = "f9823edafdffffff0000000000000000"; // u128 seen in the real tx

const MARKETS = {
  "xSOL-2609": {
    state: "DE6wBXUNR6TC57ipVmRHyvTA9a3Yu4gGLkeEegejK381",
    baseMarginVault: "Beb89qAb171gTUg2GaQMGSZqYCNYR7JUeNRUNymUCN5Q",
    yieldMarket: "EzjUdASWwhXZWHfrSqKR7QkfCwXuDzkM5D9E46pX6C8K",
    earnMarginMarket: "BycZiB9QJNd3zXqwioyyj8QUGmPo9xSYzvr16eVSXezv",
    earnMarginVault: "9ZkzgS6gvkCZQgS5pg5bJdPKcu8QCCpQGHez592PtDzM",
    earnVault: "5xgnw3RoRXir5qbQVBTWVea6qtDuNmgy8YQpZHtS8hG",
    oracle: "BRS1ntVX6ubUSGFoXsbK3XAbh5g28hyNHP19mMUX8o9p",
    observation: "HRXtTu6u538vmNNqCRCPRhyHxJai8fRfVxD4BiyMBNka",
    ymBaseVault: "DGm463HQagBq9ocLbSrw7ds5pGxDQEJPiWr6nqjR3PSR",
    poolVaultBase: "Afwz5ZrXBXSUFUqAFXAh6MnMtid4SAAXqmwfSyUgjQjA",
    ymQuoteVault: "HmQ5MZ35kg6UKg2X6396bTuS9MzyaymxDnwHQPNrvgKQ",
    poolVaultQuote: "B81bSvZ5Z4rqUyJV5hMTXrmyJNwA4Nq2NpYmWQuEx6Ud",
    ptMint: "3VXjUPCYmW4oWrVDtJ6gfRZzRfnmumFttkVKAcn7YU7v",
    outMint: "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs",
    tickArray: "HY8KRjaGnWZN4pf4QpQk3fB5d8YWd7ZdxyoQrQPvkQzT",
  },
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58d(s) {
  let n = 0n;
  for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error("bad base58"); n = n * 58n + BigInt(v); }
  const o = [];
  while (n > 0n) { o.push(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; o.push(0); }
  return Buffer.from(o.reverse());
}
function b58e(buf) {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; s = "1" + s; }
  return s || "1";
}
// findProgramAddress: bump from 255 down, append the bump as the LAST seed, and accept the
// first result that falls off the curve. Assumes no-collision (as the ATA program does).
function pda(seeds, program) {
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Buffer.from([bump]));
    h.update(program);
    h.update(Buffer.from("ProgramDerivedAddress"));
    const out = h.digest();
    if (!onCurve(out)) return out;
  }
  throw new Error("no viable bump");
}

// ed25519 decompression test: y^2 = x^3 + d x^2 + x  =>  x = sqrt(u/v), needs u/v to be a QR
function onCurve(buf) {
  const P = 2n ** 255n - 19n;
  const y = BigInt("0x" + Buffer.from(buf).reverse().toString("hex")) & ((1n << 255n) - 1n);
  if (y >= P) return false;
  const d = (-121665n * inv(121666n)) % P;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (d * y2 + 1n) % P;
  const x2 = (u * inv(v)) % P;
  if (x2 === 0n) return true;
  return pow(x2, (P - 1n) / 2n) === 1n; // Euler's criterion
}
function inv(a) {
  let [g, x, yy] = egcd(a % (2n ** 255n - 19n), 2n ** 255n - 19n);
  return x < 0n ? x + 2n ** 255n - 19n : x;
}
function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, yy] = egcd(b, a % b);
  return [g, yy, x - (a / b) * yy];
}
function pow(b, e) {
  const P = 2n ** 255n - 19n;
  let r = 1n; b %= P;
  while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
  return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let a = 0; a < 8; a++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    const j = await r.json();
    if (j.error) { if (process.env.DBG) console.log('RPCERR', method, JSON.stringify(j.error).slice(0,200)); await sleep(1200); continue; }
    return j.result;
  }
  return null;
}

async function main() {
  const [marketName, wallet] = process.argv.slice(2);
  const m = MARKETS[marketName];
  if (!m || !wallet) {
    console.error("usage: node ratex-earn-redeem.mjs <" + Object.keys(MARKETS).join("|") + "> <wallet> [--json]");
    process.exit(1);
  }
  const w = b58d(wallet);
  const ptAta = pda([w, b58d(TOKEN), b58d(m.ptMint)], b58d(ATA_P));
  const outAta = pda([w, b58d(TOKEN), b58d(m.outMint)], b58d(ATA_P));

  const info = await rpc("getAccountInfo", [b58e(ptAta), { encoding: "base64" }]);
  if (!info?.value) { console.log("no PT token account for this wallet/market"); process.exit(2); }
  const bal = Buffer.from(info.value.data[0], "base64").readBigUInt64LE(64);
  if (bal === 0n) { console.log("PT balance is zero - nothing to redeem"); process.exit(2); }

  const data = Buffer.alloc(32);
  Buffer.from(DISC, "hex").copy(data, 0);
  data.writeBigUInt64LE(bal, 8);
  Buffer.from(PRICE, "hex").copy(data, 16);

  // account order verbatim from a confirmed EarnRedeem; pt_mint must be writable (burn)
  const order = [
    [m.earnVault, 1], [m.state, 1], [wallet, 1, true],
    [TOKEN, 0], [m.baseMarginVault, 1], [m.yieldMarket, 1],
    [m.earnMarginMarket, 1], [m.earnMarginVault, 1],
    [b58e(outAta), 1], [b58e(outAta), 1],
    [m.oracle, 0], [m.observation, 1],
    [m.ymBaseVault, 1], [m.poolVaultBase, 1],
    [m.ymQuoteVault, 1], [m.poolVaultQuote, 1],
    [b58e(ptAta), 1], [m.ptMint, 1],
    [ATA_P, 0], [SYS, 0], [m.tickArray, 1],
  ];

  const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ payer: wallet, blockhash: bh.value.blockhash, ptBalance: bal.toString(), data: data.toString("base64"), accounts: order }, null, 2));
    return;
  }

  // Build a legacy message. Solana requires: signers first, then writable non-signers,
  // then readonly non-signers; the header counts each group.
  const uniq = [];
  for (const [k] of order) if (!uniq.includes(k)) uniq.push(k);
  if (!uniq.includes(PROG)) uniq.push(PROG);

  const isSigner = (k) => k === wallet;
  const isWritable = (k) => (order.find(([kk]) => kk === k)?.[1] ?? 0) === 1;
  const signers = uniq.filter(isSigner);
  const writable = uniq.filter((k) => !isSigner(k) && isWritable(k));
  const readonly = uniq.filter((k) => !isSigner(k) && !isWritable(k));
  const keys = [...signers, ...writable, ...readonly];
  const idx = new Map(keys.map((k, i) => [k, i]));

  const cu = (n) => (n < 0x80 ? Buffer.from([n]) : Buffer.from([(n & 0x7f) | 0x80, n >> 7]));

  const msg = Buffer.concat([
    Buffer.from([signers.length, 0, readonly.length]),
    cu(keys.length),
    ...keys.map((k) => b58d(k)),
    b58d(String(bh.value.blockhash)),
    cu(1),
    Buffer.from([idx.get(PROG)]),
    cu(order.length),
    ...order.map(([k]) => Buffer.from([idx.get(k)])),
    cu(data.length),
    data,
  ]);

  if (process.env.DBG) fs.writeFileSync("C:/Users/tri/Desktop/tasks/100d/msg.b64", txBytes.toString("base64"));
  // simulateTransaction takes a serialized TRANSACTION: sig count + zeroed signature + message
  const txBytes = Buffer.concat([cu(signers.length), ...signers.map(() => Buffer.alloc(64)), msg]);
  const sim = await rpc("simulateTransaction", [txBytes.toString("base64"), {
    encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed",
  }]);
  const res = sim?.value ?? sim ?? {};
  if (process.env.DBG) console.log('RAW KEYS:', Object.keys(sim || {}), JSON.stringify(sim).slice(0, 300));
  const log = (res.logs || []);
  const err = res.err ?? null;
  console.log("PT balance:", Number(bal) / 1e9);
  console.log("err:", JSON.stringify(err));
  log.filter((l) => /Redeem amount|redeem_ratio|expiry_fee|failed|Error|success/.test(l)).forEach((l) => console.log("  " + l));
  if (err) process.exit(3);
  if (!log.length) console.log("  (node returned no logs)");
  const out = log.join(" ").match(/Redeem amount: (\d+)/);
  if (out) {
    const got = Number(out[1]) / 1e6; // xSOL is 6 dp, PT is 9
    const input = Number(bal) / 1e9;
    console.log(`\n=> ${got.toFixed(6)} out for ${input.toFixed(6)} PT (${(100 - (got / input) * 100).toFixed(4)}% haircut)`);
  }
}

main();
