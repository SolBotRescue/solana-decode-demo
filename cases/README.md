# Cases

Free diagnoses, published as they are written. No email gate, no "book a call".

| Case | What it is | Verdict |
|---|---|---|
| [offcurve-26-549848471-sol](offcurve-26-549848471-sol/index.md) | 26.55 SOL sent to an off-curve typo address | Not lost, but stuck: owner is System Program, data size 0. Only an `invoke_signed` from a matching program frees it. |
| [ratex-pt-redemption-dead-frontend](ratex-pt-redemption-dead-frontend/index.md) | Redeeming matured PT-xSOL after the RateX frontend went down | Recoverable, and already was — `EarnRedeem` is callable, account order and both traps documented. |
