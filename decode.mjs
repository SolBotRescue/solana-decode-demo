/**
 * decode.mjs — Solana tx teşhis aracı
 *
 * Ham yapıyı döker VE başarısız tx'i işaretler: hangi instruction, hangi hesap rolü
 * (signer/writable), program log bağlamı, bilinen hata kodu anlamı.
 *
 * Kullanım:
 *   node decode.mjs <signature> [--program <addr>] [--json out.json]
 *   CLUSTER=devnet RPC_URL=https://api.devnet.solana.com node decode.mjs <sig>
 *
 * Sınır: semantik hesap anlamı, PDA seed ilişkisi ve iş kuralları çıkarılmaz.
 * `candidateDiscriminator` yalnızca ilk 8 bayttır — program şeması doğrulanmadan kesin değildir.
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

// bağımlılıksız base58 (Bitcoin alfabesi)
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

// ---- bilinen hata kodları ----
const SPL_TOKEN = {
  0: "NotRentExempt", 1: "InsufficientFunds", 2: "InvalidMint", 3: "MintMismatch",
  4: "OwnerMismatch", 5: "FixedSupply", 6: "AlreadyInUse", 7: "InvalidNumberOfProvidedSigners",
  8: "InvalidNumberOfRequiredSigners", 9: "UninitializedState", 10: "NativeNotSupported",
  11: "NonNativeHasBalance", 12: "InvalidInstruction", 13: "InvalidState", 14: "Overflow",
  15: "AuthorityTypeNotSupported", 16: "MintCannotFreeze", 17: "AccountFrozen",
  18: "MintDecimalsMismatch", 19: "TokenNotInitializedForMint", 20: "OwnerDoesNotMatch",
};
const ANCHOR = {
  2000: "ConstraintSeeds", 2001: "ConstraintHasOne", 2002: "ConstraintSigner", 2003: "ConstraintRaw",
  2004: "ConstraintOwner", 2005: "ConstraintRentExempt", 2006: "ConstraintExecutable",
  2007: "ConstraintState", 2008: "ConstraintAssociated", 2009: "ConstraintAssociatedInit",
  2010: "ConstraintClose", 2011: "ConstraintAddress", 2012: "ConstraintZero",
  2013: "ConstraintTokenMint", 2014: "ConstraintTokenOwner", 2500: "ConstraintSpace",
  3000: "AccountDiscriminatorAlreadySet", 3001: "AccountDiscriminatorNotFound",
  3002: "AccountDiscriminatorMismatch", 3003: "AccountDidNotDeserialize",
  3004: "AccountDidNotSerialize", 3005: "AccountNotEnoughKeys", 3006: "AccountNotMutable",
  3007: "AccountOwnedByWrongProgram", 3008: "InvalidProgramId", 3009: "InvalidProgramExecutable",
  3010: "AccountNotSigner", 3011: "AccountNotSystemOwned", 3012: "AccountNotInitialized",
  3013: "AccountNotProgramData", 3014: "AccountNotAssociatedTokenAccount", 3015: "AccountSysvarMismatch",
};
function explainCustom(code, programId) {
  if (programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" || programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") {
    return { family: "spl-token", name: SPL_TOKEN[code] ?? "bilinmeyen", hint: "SPL Token hata kodu" };
  }
  if (code >= 2000 && code < 4000) return { family: "anchor", name: ANCHOR[code] ?? "anchor-framework", hint: "Anchor framework kısıt/hesap hatası" };
  if (code >= 6000) return { family: "anchor-custom", name: `program tanımlı hata #${code - 6000}`, hint: "programın kendi hata tablosunda ara" };
  return { family: "custom", name: `custom #${code}`, hint: "program hata tablosu gerekli" };
}

// ---- tx çek ----
let tx;
for (const enc of ["json", "jsonParsed"]) {
  try {
    tx = await rpc("getTransaction", [sig, { encoding: enc, maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
    if (tx?.transaction?.message?.instructions) break;
  } catch (e) { if (enc === "jsonParsed") throw e; }
}
if (!tx) throw new Error("tx bulunamadı (veya bu node'da bulunamıyor; arşiv node'u ya da doğru CLUSTER gerekir)");

const msg = tx.transaction?.message ?? {};
const meta = tx.meta ?? {};
const header = msg.header ?? {};

const staticKeys = (msg.accountKeys ?? []).map((k) => (typeof k === "string" ? k : k?.pubkey)).filter(Boolean);
const resolved = [...staticKeys, ...(meta.loadedAddresses?.writable ?? []), ...(meta.loadedAddresses?.readonly ?? [])];

// hesap rolleri: header'dan türet (signer/writable), lookup ile gelenler readonly-writable ayrı
const numSigned = header.numRequiredSignatures ?? 0;
const numReadonlySigned = header.numReadonlySignedAccounts ?? 0;
const numReadonlyUnsigned = header.numReadonlyUnsignedAccounts ?? 0;
function role(idx, kind) {
  const isSigner = idx < numSigned;
  const isWritable = isSigner
    ? idx < numSigned - numReadonlySigned
    : idx < staticKeys.length - numReadonlyUnsigned;
  if (kind === "inner" || idx >= staticKeys.length) {
    const loadedWritable = meta.loadedAddresses?.writable ?? [];
    return { signer: false, writable: loadedWritable.includes(resolved[idx]) };
  }
  return { signer: isSigner, writable: isWritable };
}

function toBuf(d) {
  if (d == null) return Buffer.alloc(0);
  if (Array.isArray(d)) return Buffer.from(d);
  if (typeof d === "object") return Buffer.alloc(0);
  return b58decode(d);
}

function walk(instructions, kind, ci, acc) {
  instructions.forEach((ix, i) => {
    const pidIdx = typeof ix.programIdIndex === "number" ? ix.programIdIndex : undefined;
    const pid = ix.programId ?? (pidIdx !== undefined ? resolved[pidIdx] : undefined);
    const bytes = toBuf(ix.data);
    const accts = ix.accounts ?? ix.accountKeyIndexes ?? [];
    acc.push({
      kind,
      path: kind === "inner" ? `inner[${ci}][${i}]` : `top[${i}]`,
      depth: kind === "inner" ? 2 : 1,
      programId: String(pid ?? "?"),
      accounts: accts.map((a) =>
        typeof a === "number" ? { pubkey: resolved[a] ?? `#${a}`, ...role(a, kind) } : { pubkey: a, signer: false, writable: false }),
      bytes,
    });
  });
}

const acc = [];
walk(msg.instructions ?? [], "top", 0, acc);
for (const group of meta.innerInstructions ?? []) walk(group.instructions ?? [], "inner", group.index, acc);

// ---- hata konumu ve log bağlamı ----
const failing = new Set();
/** RPC hatası iç içe: [topIdx, {InstructionError:[innerIdx, {..}]}] — row path'lerine birebir çevir */
function markErr(err, topIdx) {
  if (!Array.isArray(err)) return;
  const [idx, inner] = err;
  if (topIdx === undefined) {
    failing.add(`top[${idx}]`);
    if (inner?.InstructionError) markErr(inner.InstructionError, idx);
  } else {
    failing.add(`inner[${topIdx}][${idx}]`);
    if (inner?.InstructionError) markErr(inner.InstructionError, topIdx);
  }
}
if (meta.err?.InstructionError) markErr(meta.err.InstructionError);

const logs = (meta.logMessages ?? []).map((l, i) => ({ i, text: l }));
const programLogs = logs.filter((l) => /Program log:|failed:|Program return:|invoke \[/.test(l.text));

const topLevelCode = (() => {
  let e = meta.err;
  while (e?.InstructionError) e = e.InstructionError[1];
  return typeof e === "object" && e?.Custom !== undefined ? e.Custom : undefined;
})();

const rows = acc.map((i) => {
  const isFail = failing.has(i.path);
  return {
    kind: i.kind,
    path: i.path,
    failed: isFail,
    programId: i.programId,
    signerAccounts: i.accounts.filter((a) => a.signer).map((a) => a.pubkey),
    writableAccounts: i.accounts.filter((a) => a.writable).map((a) => a.pubkey),
    accountCount: i.accounts.length,
    accounts: i.accounts.map((a) => (a.signer ? `${a.pubkey} [signer]` : a.writable ? `${a.pubkey} [w]` : a.pubkey)),
    dataLen: i.bytes.length,
    dataHex: i.bytes.length <= 128 ? i.bytes.toString("hex") : `${i.bytes.subarray(0, 128).toString("hex")}…(${i.bytes.length}b)`,
    candidateDiscriminator: i.bytes.length >= 8 ? i.bytes.subarray(0, 8).toString("hex") : null,
    note: isFail ? "hata bu instruction" : undefined,
  };
}).filter((r) => !onlyProgram || r.programId === onlyProgram);

const failingRows = rows.filter((r) => r.failed);
const failingProgram = failingRows[0]?.programId;

const diagnosis = meta.err
  ? {
      failed: true,
      failingInstruction: failingRows.map((r) => r.path),
      failingProgram,
      code: topLevelCode,
      meaning: topLevelCode !== undefined ? explainCustom(topLevelCode, failingProgram) : null,
      programsInvolved: [...new Set(acc.map((i) => i.programId))],
      note: "Instruction hatası CPI zincirinde olabilir; log bağlamına bakmadan kesin kök neden deme.",
    }
  : { failed: false };

const report = {
  signature: sig,
  explorer: explorer(sig),
  version: tx.version ?? "legacy",
  slot: tx.slot,
  blockTime: tx.blockTime,
  err: meta.err ?? null,
  diagnosis,
  fee: meta.fee,
  cuConsumed: meta.computeUnitsConsumed,
  instructionCount: acc.length,
  programs: [...new Set(acc.map((i) => i.programId))],
  programLogs,
  rows,
};

console.log(JSON.stringify(report, null, 2));
if (outJson) { writeFileSync(outJson, JSON.stringify(report, null, 2)); console.log(`\n→ ${outJson}`); }
