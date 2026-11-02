const crypto = require("crypto");
const { PublicKey } = require("C:/Users/tri/Desktop/tasks/wallet/node_modules/@solana/web3.js");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// correct: count leading '1's once, then prepend that many zero bytes
const d = s => { let n=0n; for(const c of s){const v=B58.indexOf(c); if(v<0) throw new Error("bad"); n=n*58n+BigInt(v);} const o=[]; while(n>0n){o.push(Number(n&0xffn)); n>>=8n;} let lead=0; for(const c of s){if(c!=="1")break; lead++;} const body=Buffer.from(o.reverse()); return Buffer.concat([Buffer.alloc(lead), body]); };
const pda = (seeds,p) => { const h=crypto.createHash("sha256"); for(const s of seeds)h.update(s); h.update(p); h.update(Buffer.from("ProgramDerivedAddress")); return h.digest(); };
const w = d("14eFJCEsNtXP6pABrDPXPpja4UKjxH9g1SMwr1osDFWX");
const ata = pda([w, d("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), d("3VXjUPCYmW4oWrVDtJ6gfRZzRfnmumFttkVKAcn7YU7v")], d("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"));
const e = buf => { let n=0n; for(const b of buf) n=n*256n+BigInt(b); let s=""; while(n>0n){s=B58[Number(n%58n)]+s; n/=58n;} let lead=0; for(const b of buf){if(b!==0)break; lead++;} return "1".repeat(lead)+s; };
console.log("mine    :", e(ata));
console.log("web3.js :", PublicKey.findProgramAddressSync([w, d("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), d("3VXjUPCYmW4oWrVDtJ6gfRZzRfnmumFttkVKAcn7YU7v")], new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"))[0].toBase58());
