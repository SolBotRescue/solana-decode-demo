**Good news first: the 539 USDC was not lost. It is sitting intact, right now, in a token account owned by that address. The reason you can't see it is that the *wallet* is empty while the *token account* holds the money — and most explorers and wallets only show the first.**

**The catch, and it is the real answer to "can it be recovered":** that token account is **below the rent-exempt minimum**, which blocks the one instruction you would need. The whole recovery is a 0.00055 SOL top-up plus one signature.

## 1. What the transaction actually did

Signature `3NPf8YUp…`, 2026-10-01 22:58:31 UTC, `err: null` — it succeeded, and it was a normal SPL transfer of exactly `539000000` (539 USDC) into:

```
token account  4uweRvCHYqzy38491DCb55iwugvg72qmg2iraNrRqnrs
mint           EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  (real USDC)
owner          CpKpD5DCaQd1fpRNpxXqz7WQ3F6WYhuncHRRvhFnQmct
amount         539  (state: initialized, no delegate, no close authority)
```

That token account is the canonical associated token account (ATA) for `CpKpD5DC…` and USDC — it derives deterministically, which is why it exists at all. It is the *only* transaction on the address.

## 2. Answering your four questions precisely

**Did the USDC reach the destination?** Yes. Verifiably, still there, 539.000000, untouched since 1 October.

**Can an address show "Account does not exist" while holding USDC?** Yes, and this is the crux. A *wallet* address and a *token account* are different accounts. `CpKpD5DC…` has 0 lamports and 0 data, so it does not exist as a system account. But USDC never lives on the wallet — it lives in the ATA, and the ATA does exist (165 bytes, 1,488,440 lamports) and holds your money. "Account does not exist" on the wallet is therefore **expected and harmless**, not evidence the funds vanished.

**Is there a technical way to recover it?** Yes, if and only if you can sign for `CpKpD5DC…` — which brings us to the character error.

**If it was meant to be a Binance deposit address?** Then this is the decisive test: compare full strings, not the first and last characters. If your intended address differs anywhere in the middle, no key exists for the wrong one and only the two paths below apply. If it differs *only* by case — e.g. you typed `QmCT` instead of `Qmct` — it is the same key and simply import your seed.

## 3. Why the address is *not* inherently unrecoverable

This is the point the other answer misses: `CpKpD5DC…` is **on-curve** (`isOnCurve = true`). Unlike an off-curve typo, an on-curve address is somebody's real public key. If that somebody is you — e.g. a throwaway keypair generated in a wallet, or a paste-in mistake rather than a hand-typed one — it is fully spendable.

Check in one second: import the address read-only into Phantom/Solflare as a *watch-only* account and look. If the balance appears, the address is being read correctly and the question is only whether you have the key.

## 4. ⚠️ The blocker that will stop a naive rescue

```
token account lamports   1,488,440
rent-exempt minimum      2,039,280
                    short by  550,840  (0.00055 SOL)
```

The ATA is **not rent-exempt**. Two consequences:

- It still *received* 539 USDC fine, because receiving does not require exemption.
- But `CloseAccount` — the only instruction that moves lamports *out*, and the way you would recover both the token and the 0.00203 SOL rent — fails while the account is below the floor. Freed from the ATA, the lamports are partly consumed and the account lands under threshold.

**Fix:** send ~0.0006 SOL to the **token account** `4uweRvCH…` (not the wallet address). Then it is exempt, and `CloseAccount` succeeds. In practice you don't even need a separate step:

1. Send 0.0006 SOL to `4uweRvCHYqzy38491DCb55iwugvg72qmg2iraNrRqnrs`.
2. Swap or transfer the 539 USDC (normal ATA transfer, now unblocked).
3. `CloseAccount` and reclaim the SOL.

## 5. If you do not have the key

Then it is genuinely gone to you, and here is what is still true and worth knowing:

- Nothing is decaying. The USDC stays where it is indefinitely and the account is never closed by rent — there is no sweep timer, only the exemption state.
- The 1,488,440 lamports never shrink. Solana does not charge rent; a short-of-exempt account just stays short-of-exempt.
- Whoever ends up with that key inherits both the 539 USDC and a broken account state. If the key is a Binance deposit address, Binance *can* still credit it if you open a ticket with this exact signature — their internal crediting does not need the wallet to look populated. That is the highest-value move available to you and it is administrative, not technical.

## 6. Do not repeat this part

The mistake was a one-character edit of a destination. Two cheap habits fix it: paste the address and compare the **full string against the clipboard**, and for anything above ~$50 send a small test first — the 539 USDC would still have been recoverable here, but only because the typo happened to land on an on-curve address. A typo onto an off-curve address is a different story and usually permanent.
