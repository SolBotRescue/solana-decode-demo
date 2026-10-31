# solana-decode-demo

Şeması olmayan bir Solana programına bağlanmaya çalışırken tıkanma noktası: **instruction'lar ne diyor, hangi hesaplar geçiyor?**

Bu araç mainnet tx'ini ham seviyede döker — üst ve CPI (inner) instruction'lar, çözülmüş hesap listesi, veri uzunluğu, varsa Anchor discriminator. IDL üretmez; **insanın okuyabileceği döküm** verir.

```bash
node decode.mjs <signature>
node decode.mjs <signature> --program <programId> --json out.json
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com node decode.mjs <sig>
```

Örnek: `demo-whirlpool.json` — 25 instruction, 9 program, discriminator'lar dahil (Whirlpool swap).

## Ne çıkarır

- `kind` / `path` — üst (`top`) veya CPI (`inner`) konumu
- `programId`, hesap listesi (lookup tabloları çözülmüş)
- `dataLen`, `dataHex` (≤128 bayt tam), `anchorDisc` (ilk 8 bayt), `anchorNameHintIndex` (9. bayt)
- `err`, `fee`, `cuConsumed`, solscan linki

## Ne çıkarmaz

Hesap anlamları, PDA/seed ilişkileri, iş kuralları. discriminator→isim eşlemesi ve doğrulanmış istemci ayrı iştir — asıl iş de odur.

## Fiyat

| Paket | Teslimat | Fiyat |
|---|---|---|
| Decode Fix | tek instruction + hesap haritası, doğrulanmış | 250 USDC |
| Integration Rescue | tam şema + tipli istemci + PDA haritası, canlı tx ile test | 600 USDC |
| Complex / native | binary analizi + CPI zinciri + doküman | 1.200 USDC |
