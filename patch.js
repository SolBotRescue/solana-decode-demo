const fs = require("fs");
let s = fs.readFileSync("tools/pda-sweep.mjs", "utf8");
s = s.replace('import { PublicKey } from "@solana/web3.js";', 'import { PublicKey } from "file:///C:/Users/tri/Desktop/tasks/wallet/node_modules/@solana/web3.js/lib/index.esm.js";');
// drop the executable-filter step into a lighter version: just use harvested keys, no getMultipleAccounts dependency
fs.writeFileSync("tools/pda-sweep.mjs", s);
console.log("patched");
