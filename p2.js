const fs = require("fs");
let s = fs.readFileSync("tools/ratex-earn-redeem.mjs", "utf8");
// simulateTransaction needs the log filter to catch the payout line the program prints
s = s.replace(
  'log.filter((l) => /Redeem amount|redeem_ratio|expiry_fee|failed|Error/.test(l)).forEach((l) => console.log("  " + l));',
  'log.filter((l) => /Redeem amount|redeem_ratio|expiry_fee|failed|Error|success/.test(l)).forEach((l) => console.log("  " + l));'
);
fs.writeFileSync("tools/ratex-earn-redeem.mjs", s);
