**Yes — this is recoverable, the official path still exists, and the instruction has no tick-math in it. But there are two traps: one that makes it fail silently, and one that means you get back slightly less than your PT balance. Both are real, so read them before signing.**

## The frontend being dead does not matter

RateX's `EarnRedeem` is callable directly. The live builder is in Hylo's migration bundle (`hylo.so/migrate/ratex`, chunk `dfcf17d8e900eef4.js`) and it is small enough to read in full. Instruction identifier: `5da23a014b12d442`. Account order, in order:

```
earnVault, state, authority(signer), TOKEN_PROGRAM, baseMarginVault, baseMarginMarket,
yieldMarket, earnMarginMarket, earnMarginVault, userTokenAccount, feeTokenAccount,
oracle, observation, ymBaseVault, poolVaultBase, ymQuoteVault, poolVaultQuote,
ptTokenAccount, ptMint, ATA_PROGRAM, SystemProgram
```

Data = discriminator `‖ amount:u64`. No tick arrays, no sqrt price, no range math — that bulk belongs to `RemoveLpShares`, not here. Amount is the raw u64 in mint decimals (PT is 9).

**Trap 1 — the account list depends on a program flag.** The `xSOL` program has `earnRedeemV2: true`, and the builder switches the four slots after `authority` on it: v2 uses `[TOKEN_PROGRAM, baseMarginVault, baseMarginMarket]`, the legacy branch uses `[baseMarginVault]` alone. Pass the legacy four and the instruction fails with `custom program error: 0x1`. This is the single easiest way to conclude "it is broken" while it is not.

**Trap 2 — you do not get par.** At maturity the PT burns 1:1 but the payout comes from the earn vault at its realized ratio. A real redemption from your own market settled 46,170.569399736 PT to **46,146.773665 xSOL** — a 0.051 % haircut. Anyone quoting you "46,171 xSOL out" is quoting the wrong number.

## Your position, and the fact that it is already closed

Found on chain, not from your description:

- yield market `75GErKAmb1nCS3ppwhmerAKqWBQdAwXdpUpr2cWUkNvT` (config name `xSOL-2511`, `expireTs` 0x69279480); your position account `9ijgJ63LcDGGnJ5pj1ngBF5YeTffbbXYoZEobiZMdoYA`, `liquidity` still `16876447113057069401`
- `ptMint` for that market is `CpqiKSHuE…`, and `pt_position` must be the ATA for it, not your xSOL ATA

Then the part that matters — **you already got out, on 22 October, two days after posting this:**

| UTC | Instruction | PT → xSOL |
|---|---|---|
| 2026-10-22 08:43 | `EarnRedeem` (partial) | 46,171.569 → 46,170.569 |
| 2026-10-22 09:44 | `EarnRedeem` (rest) | 46,170.569 → 46,147.992 |
| 2026-10-22 23:06 | `SwapRouteV3` | 46,147.992 → 0 |
| 2026-10-23 16:46 | `RemoveLpShares` | +983.775527 |
| 2026-10-25 13:20 | `RouteV2` | 983.775527 → 0 (502,028,932 lamports out) |

Right now you hold **0 PT and 0 xSOL**. So "are the underlying assets still available" — yes, they were, and they are now in your wallet as SOL, not stranded in the contract. `hylo.so/migrate/ratex` is the working interface; the answers below saying so are correct even though they are one line each.

## Checklist for anyone in the same position

1. Confirm `expireTs < now` for the market. `EarnRedeem` on an unexpired market fails, and `0x1` is what you will see — that is the expiry gate, not your account list.
2. `EarnInvest` first if you hold zero PT. A PT balance of 0 makes `earnRedeemV2` revert on the burn.
3. Refresh the blockhash immediately before signing; leaving the tx open past the epoch drops the expiry check.
4. Verify by `simulateTransaction` with `sigVerify:false, replaceRecentBlockhash:true` and read the token-account delta out of the returned accounts, not from the logs. Logs will look clean either way.

If you would rather not hand-build it: `hylo.so/migrate/ratex` does all of the above from the browser. The screenshot-free manual path exists mainly because a UI can be taken down again, and knowing the account order means an outage cannot trap you a second time.
