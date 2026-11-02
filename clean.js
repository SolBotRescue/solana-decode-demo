const fs = require("fs");
let t = fs.readFileSync("tools/pda-sweep.mjs", "utf8");
// fix mojibake in the doc comment and drop the now-unused helper
t = t.split("\u00e2\u20ac\u2013").join("-").split("\u00e2\u20ac\u201d").join("-").split("\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u0153").join("-");
t = t.replace(/const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";\n/, "");
fs.writeFileSync("tools/pda-sweep.mjs", t, "utf8");
console.log("cleaned");
