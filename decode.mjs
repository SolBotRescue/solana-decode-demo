/**
 * decode.mjs — Solana tx'inden instruction decode (demo aracı)
 * Amaç: "kaynağı yok/şema yok" durumunda ham yapıyı ne kadar hızlı çıkardığını kanıtlamak.
 *
 * Kullanım:
 *   node decode.mjs <signature> [--program <addr>] [--json <out.json>]
 *   CLUSTER=devnet RPC_URL=https://api.devnet.solana.com node decode.mjs <sig>
 *
 * Not: bu araç IDL üretmez; ham instruction + hesap + veri dökümü verir.
 * Anchor 8 bayt discriminator'ı olan bir programda `anchorDisc` alanı dolar.
 */
import { writeFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const CLUSTER = process.env.CLUSTER ?? "mainnet";
const sig = process.argv[2];
if (!sig) {
  console.error("kullanım: node decode.mjs <signature> [--program <addr>] [--json out.json]");
  process.exit(1);
}
const flag = (n) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const onlyProgram = flag("--program");
const outJson = flag("--json");

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

// bağımlılıksız base58 (Bitcoin alfabesi) — RPC json encoding veriyi base58 döner
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = new Map([...ALPHA].map((c, i) => [c, i]));
function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const v = MAP.get(c);
    if (v === undefined) throw new Error(`base58: geçersiz karakter "${c}"`);
    n = n * 58n + BigInt(v);
  }
  const out = [];
  while (n > 0n) { out.push(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; out.push(0); }
  return Buffer.from(out.reverse());
}

const explorer = (s) => `https://solscan.io/tx/${s}${CLUSTER === "mainnet" ? "" : `?cluster=${CLUSTER}`}`;

let tx;
for (const enc of ["json", "jsonParsed"]) {
  try {
    tx = await rpc("getTransaction", [sig, { encoding: enc, maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
    if (tx?.transaction?.message?.instructions) break;
  } catch (e) {
    if (enc === "jsonParsed") throw e;
  }
}
if (!tx) throw new Error("tx bulunamadı (veya bu node'da bulunamıyor)");

const msg = tx.transaction?.message ?? {};
const meta = tx.meta ?? {};

// anahtarlar: statik anahtarlar + versioned lookup tabloları (published API index sırası)
const staticKeys = (msg.accountKeys ?? [])
  .map((k) => (typeof k === "string" ? k : k?.pubkey))
  .filter(Boolean);
const resolved = [
  ...staticKeys,
  ...(meta.loadedAddresses?.writable ?? []),
  ...(meta.loadedAddresses?.readonly ?? []),
];

function toBuf(d) {
  if (d == null) return Buffer.alloc(0);
  if (Array.isArray(d)) return Buffer.from(d);
  if (typeof d === "object") return Buffer.alloc(0); // parsed (jsonParsed) — ham bayt yok
  return b58decode(d);
}

function walk(instructions, kind, ci, acc) {
  instructions.forEach((ix, i) => {
    const pid = ix.programId ?? (typeof ix.programIdIndex === "number" ? resolved[ix.programIdIndex] : undefined);
    const bytes = toBuf(ix.data);
    acc.push({
      kind,
      path: kind === "inner" ? `inner[${ci}][${i}]` : `top[${i}]`,
      programId: String(pid ?? "?"),
      accounts: (ix.accounts ?? ix.accountKeyIndexes ?? []).map((a) =>
        typeof a === "number" ? resolved[a] ?? `#${a}` : a),
      bytes,
    });
  });
}

const acc = [];
walk(msg.instructions ?? [], "top", 0, acc);
for (const group of meta.innerInstructions ?? []) walk(group.instructions ?? [], "inner", group.index, acc);

const rows = acc
  .map((i) => ({
    kind: i.kind,
    path: i.path,
    programId: i.programId,
    accountCount: i.accounts.length,
    accounts: i.accounts,
    dataLen: i.bytes.length,
    dataHex: i.bytes.length <= 128 ? i.bytes.toString("hex") : `${i.bytes.subarray(0, 128).toString("hex")}…(${i.bytes.length}b)`,
    anchorDisc: i.bytes.length >= 8 ? i.bytes.subarray(0, 8).toString("hex") : null,
    anchorNameHintIndex: i.bytes.length > 8 ? i.bytes[8] : null,
  }))
  .filter((r) => !onlyProgram || r.programId === onlyProgram);

const report = {
  signature: sig,
  explorer: explorer(sig),
  slot: tx.slot,
  blockTime: tx.blockTime,
  err: meta.err ?? null,
  fee: meta.fee,
  cuConsumed: meta.computeUnitsConsumed,
  instructionCount: acc.length,
  programs: [...new Set(acc.map((i) => i.programId))],
  rows,
};

console.log(JSON.stringify(report, null, 2));
if (outJson) { writeFileSync(outJson, JSON.stringify(report, null, 2)); console.log(`\n→ ${outJson}`); }
