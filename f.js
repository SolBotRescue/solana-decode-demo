const fs = require("fs");
let s = fs.readFileSync("tools/ratex-earn-redeem.mjs", "utf8");
s = s.replace("b58e(ata)", "b58e(ptAta)");
// ensure blockhash is stringified, and keep the encoder/decoder correct
fs.writeFileSync("tools/ratex-earn-redeem.mjs", s);
console.log("fixed ref");
