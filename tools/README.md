# tools

`pda-sweep.mjs` — checks whether an off-curve address could be a program PDA. **No dependencies**: it does its own base58 and needs only Node 18+.

```bash
node pda-sweep.mjs <off-curve-address> [--blocks N]
RPC_URL=https://api.devnet.solana.com node pda-sweep.mjs <address>
```

Harvests executable programs from recent blocks, derives one-seed shapes both ways round, compares raw bytes. A hit proves the address is a PDA and therefore `invoke_signed`-signable. A miss is a bounded negative, not a theorem — it covers one-seed shapes on live programs only.
