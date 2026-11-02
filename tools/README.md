# tools

`pda-sweep.mjs` — checks whether an off-curve address could be a program PDA. **No dependencies**: own base58 and ed25519 curve test.

```bash
node pda-sweep.mjs <off-curve-address> [--blocks N]
```

`ratex-earn-redeem.mjs` — builds and simulates a RateX `EarnRedeem` for an expired PT position without the frontend. **No dependencies.** Account order taken verbatim from a confirmed on-chain transaction, not inferred.

```bash
node ratex-earn-redeem.mjs <market> <wallet>          # simulate, print the payout
node ratex-earn-redeem.mjs <market> <wallet> --json   # emit the pieces for your own tx
```

45 expired markets across 12 assets, each with its own program id. Verified on xSOL-2609 and hyUSD-2609 — both simulate green at the same **0.1147% haircut**, so it is a protocol constant, not par.
