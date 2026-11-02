# tools

`pda-sweep.mjs` — checks whether an off-curve address could be a program PDA. **No dependencies**: it does its own base58 and ed25519 curve test.

```bash
node pda-sweep.mjs <off-curve-address> [--blocks N]
```

`ratex-earn-redeem.mjs` — builds and simulates a RateX `EarnRedeem` for an expired PT position without the frontend. **No dependencies.** Account order taken verbatim from a confirmed on-chain transaction, not inferred.

```bash
node ratex-earn-redeem.mjs <market> <wallet>          # simulate, print the payout
node ratex-earn-redeem.mjs <market> <wallet> --json   # emit the pieces for your own tx
```

Markets: `xSOL-2609`. Only expired markets redeem. Verified against two real holders.
