# solana-decode-demo

On-chain diagnosis for Solana problems where the money is already stuck: a wrong address, a frozen account, a dead frontend, a stalled protocol.

The pattern across every case here is the same — decode the transaction, check the account owner and state, and say whether it is recoverable or a dead end. Including when the answer is a dead end, which is worth having because it stops the search being rerun hopefully every month.

**Three published cases, free, no email gate:**

| Case | Verdict |
|---|---|
| [26.55 SOL on an off-curve address](cases/offcurve-26-549848471-sol/index.md) | Stuck, not lost. A 15,456-derivation sweep across 184 live programs found no PDA match. |
| [539 USDC in an ATA after a typo](cases/usdc-539-ata-dust-rescue.md) | Recoverable. Balances verified by simulation; close order documented. |
| [Matured RateX PT after the frontend died](cases/ratex-pt-redemption-dead-frontend/index.md) | Recoverable. Instruction rebuilt, both silent traps documented. |

## Getting your own case diagnosed

Comment or open an issue with the signature (or the addresses, if there is no transaction). **Diagnosis first, you pay after you receive the report** — $49 USDC, same day. If the report is a dead end, it is still a verified one and you decide whether the next step is worth $140.

Payout, if you decide it was: `3HLDkipdKmJKGjbgCD8moo3GyhEY4DWdZ7JAgSpMysHp` (Solana USDC).

## Tools

`decode.mjs` — dumps a mainnet transaction without an IDL: top-level and CPI instructions, resolved account list with signer/writable flags, and which instruction actually failed. It does not invent an IDL; it gives an evidence-based reading.

```bash
node decode.mjs <signature>
node decode.mjs <signature> --program <programId> --json out.json
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com node decode.mjs <sig>
```

Samples: `demo-whirlpool.json` (successful swap, 25 instructions) · `demo-fail.json` (failed tx — `top[4]`, SPL `InsufficientFunds`).

Output: `diagnosis` (failing instruction, program, decoded SPL/Anchor code meaning, CPI caveat), `programLogs`, `kind`/`path`, accounts with `[signer]`/`[w]`, `dataLen`, `dataHex`, `candidateDiscriminator`.

`tools/pda-sweep.mjs` — checks whether an off-curve address could be a program PDA. No dependencies; does its own base58.

```bash
node tools/pda-sweep.mjs <off-curve-address>
```

## What this does not claim

| Claim | Reality |
|---|---|
| `candidateDiscriminator` equals the instruction name | It is the first 8 bytes and is **not** certain. Anchor 0.31+ can vary length. No naming before the program schema is checked. |
| "25 instructions decoded" means 25 types supported | No. It exposes byte positions; parameter meaning and account roles are separate work. |
| One transaction equals a full PDA map | No. A single successful transaction does not reveal a program's seed relationships. |
| A sweep miss is proof of impossibility | No. It covers one-seed shapes on live programs only — not multi-seed shapes, not project-specific seed strings. |

## Known ramp

Legacy, v0 and v1 transactions are handled separately (falling back to v0 on nodes that reject v1). Archived transactions need an archive node via `RPC_URL`.

## Pricing

| Package | Delivery | Price |
|---|---|---|
| Quick Diagnosis | Failure analysis + short report | 25 USDC |
| Bot Rescue | Repair of one defined problem + test | 150–250 USDC |
| Integration Rescue | Integration within a defined scope + test | 400–600 USDC |
| Advanced RE | Quoted after look | 800 USDC+ |

Success is written into the work: *the agreed failure is gone and the same operation runs in the customer's own test environment.* Failures outside the agreed scope are out of scope.
