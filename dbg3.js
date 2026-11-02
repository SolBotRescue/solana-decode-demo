// dump the raw simulate response shape for the real tx
const fs = require("fs");
let s = fs.readFileSync("tools/ratex-earn-redeem.mjs", "utf8");
s = s.replace("const res = sim?.value ?? sim ?? {};", "const res = sim?.value ?? sim ?? {};\n  if (process.env.DBG) console.log('RAW KEYS:', Object.keys(sim || {}), JSON.stringify(sim).slice(0, 300));");
fs.writeFileSync("tools/ratex-earn-redeem.mjs", s);
