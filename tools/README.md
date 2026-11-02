# tools

`pda-sweep.mjs` — checks whether an off-curve address could be a program PDA. **No dependencies**: own base58 and ed25519 curve test.

```bash
node pda-sweep.mjs <off-curve-address> [--blocks N]
```

`ratex-earn-redeem.mjs` — RateX's frontend is dead; this finds your stuck positions and builds the redemption without it. **No dependencies.** Account order taken verbatim from a confirmed on-chain transaction, not inferred.

```bash
node ratex-earn-redeem.mjs <wallet>                   # scan: what does this wallet hold?
node ratex-earn-redeem.mjs <market> <wallet>          # simulate, print the exact payout
node ratex-earn-redeem.mjs <market> <wallet> --json   # emit the pieces for your own tx
```

45 expired markets across 12 programs. **The haircut is per market**: 0.1149% on xSOL and hyUSD, 8.23% on USD* — measured in one session, so read the number before signing.
