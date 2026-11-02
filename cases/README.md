# Cases

Free diagnoses, published as they are written. No email gate, no "book a call".

| Case | What it is | Verdict |
|---|---|---|
| [offcurve-26-549848471-sol](offcurve-26-549848471-sol/index.md) | 26.55 SOL sent to an off-curve typo address | Not lost, but stuck: owner is System Program, data size 0. A 15,792-derivation sweep across 188 live programs found no PDA match. |
| [ratex-pt-redemption-dead-frontend](ratex-pt-redemption-dead-frontend/index.md) | Redeeming matured PT-xSOL after the RateX frontend went down | Recoverable, and already was — `EarnRedeem` is callable, account order and both traps documented. |
| [usdc-539-ata-dust-rescue](usdc-539-ata-dust-rescue.md) | 539 USDC sent to a hand-typed address | Recoverable: USDC intact in the ATA. Close order verified by simulation (error 11 if non-empty). |
