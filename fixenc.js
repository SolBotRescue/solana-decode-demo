const fs = require("fs");
const p = "tools/pda-sweep.mjs";
let t = fs.readFileSync(p, "utf8");
t = t.split("\u00e2\u20ac\u201d").join("-");
t = t.split("\u00e2\u20ac\u2122").join("'");
fs.writeFileSync(p, t, "utf8");
const line = t.split("\n").find(l => l.includes("no hit"));
console.log("LINE:", line);
