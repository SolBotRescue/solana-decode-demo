const fs = require("fs");
const p = "tools/ratex-earn-redeem.mjs";
let s = fs.readFileSync(p, "utf8");
// exit 2 on a clean "nothing to do" so PowerShell does not print the assertion noise
s = s.replace('console.log("no PT token account for this wallet/market"); process.exit(2);', 'console.log("no PT token account for this wallet/market"); process.exitCode = 2; return;');
s = s.replace('console.log("PT balance is zero - nothing to redeem"); process.exit(2);', 'console.log("PT balance is zero - nothing to redeem"); process.exitCode = 2; return;');
s = s.replace('if (err) process.exit(3);', 'if (err) { process.exitCode = 3; return; }');
fs.writeFileSync(p, s);
console.log("exit codes softened");
