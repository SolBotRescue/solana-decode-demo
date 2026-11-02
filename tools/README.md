# tools

`pda-sweep.mjs` — derived-vs-live-program sweep for an off-curve address. No dependencies, does its own base58.

```bash
node pda-sweep.mjs <off-curve-address> [--blocks N]
```

Harvests executable programs from recent blocks, tries one-seed shapes both ways round, compares raw bytes. A hit proves the address is a program PDA and therefore `invoke_signed`-signable. A miss is a bounded negative, not a theorem — it covers one-seed shapes on live programs only.
