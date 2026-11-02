const crypto = require("crypto");
const fs = require("fs");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const d = s => { let n=0n; for(const c of s){const v=B58.indexOf(c); n=n*58n+BigInt(v);} const o=[]; while(n>0n){o.push(Number(n&0xffn)); n>>=8n;} for(const c of s){if(c!=="1")break; o.push(0);} return Buffer.from(o.reverse()); };
const e = buf => { let n=0n; for(const b of buf) n=n*256n+BigInt(b); let s=""; while(n>0n){s=B58[Number(n%58n)]+s; n/=58n;} for(const b of buf){if(b!==0)break; s="1"+s;} return s||"1"; };
const pda = (seeds,p) => { const h=crypto.createHash("sha256"); for(const s of seeds)h.update(s); h.update(p); h.update(Buffer.from("ProgramDerivedAddress")); return h.digest(); };
const w = d("14eFJCEsNtXP6pABrDPXPpja4UKjxH9g1SMwr1osDFWX");
const ata = pda([w, d("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), d("3VXjUPCYmW4oWrVDtJ6gfRZzRfnmumFttkVKAcn7YU7v")], d("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"));
console.log("derived:", e(ata), "| expected: (see earlier) 0x7d8Z...");
// fetch module text and patch the two real bugs
let s = fs.readFileSync("tools/ratex-earn-redeem.mjs", "utf8");
s = s.replace('[b58e(ptAta), { encoding: "base64" }]', '[b58e(ata), { encoding: "base64" }]');
s = s.replace('b58d(bh.value.blockhash)', 'b58d(String(bh.value.blockhash))');
fs.writeFileSync("tools/ratex-earn-redeem.mjs", s);
console.log("patched");
