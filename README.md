# solana-decode-demo

Şeması olmayan bir Solana programına bağlanmaya çalışırken tıkanma noktası: **instruction'lar ne diyor, hangi hesaplar geçiyor, neden patladı?**

Bu araç mainnet tx'ini döker — üst ve CPI (inner) instruction'lar, çözülmüş hesap listesi (signer/writable işaretli), veri, ve **başarısız tx'te hatanın hangi instruction'da olduğunu** gösterir. IDL üretmez; insanın okuyabileceği, kanıta dayalı döküm verir.

```bash
node decode.mjs <signature>
node decode.mjs <signature> --program <programId> --json out.json
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com node decode.mjs <sig>
```

Örnek: `demo-whirlpool.json` (başarılı swap, 25 instruction) · `demo-fail.json` (başarısız tx — `top[4]`, SPL `InsufficientFunds`).

## Çıktı

- `diagnosis` — hata varsa hangi instruction, hangi program, kod anlamı (SPL / Anchor tabloları), CPI zinciri uyarısı
- `programLogs` — "Error: insufficient funds" gibi bağlam satırları, sırayla
- `kind`, `path` — üst (`top`) veya CPI (`inner`) konumu; `failed` işareti
- hesap listesi: `[signer]` / `[w]` rolleriyle
- `dataLen`, `dataHex`, `candidateDiscriminator`

## Neyi iddia etmez

| İddia | Gerçek |
|---|---|
| `candidateDiscriminator` = instruction adı | İlk 8 bayttır, **kesin değil**. Anchor 0.31+ özel uzunluk kullanabiliyor. Program şeması doğrulanmadan isim verme. |
| 25 instruction çözdüm = 25 tip destekliyorum | Hayır. Bayt konumları çıkar; parametre anlamı ve hesap rolü ayrı iştir. |
| Tek tx = tam PDA haritası | Hayır. Tek başarılı tx bir programın bütün seed ilişkilerini göstermez. |
| Tam şema garantisi | Kapsam tanımlıysa "o entegrasyon için doğrulanmış şema" — hepsi değil. |

## Bilinen rampa

Legacy + v0 + v1 tx'ler ayrı ele alınıyor (v1'i reddeden node'da v0'a düşer). Arşivlenmiş eski tx için arşiv node'u gerekir (`RPC_URL`).

## Fiyat

| Paket | Teslimat | Fiyat |
|---|---|---|
| Quick Diagnosis | Hata analizi + kısa rapor | 25 USDC |
| Bot Rescue | Tanımlı tek sorunun onarımı + test | 150–250 USDC |
| Integration Rescue | Tanımlı kapsamda entegrasyon + test | 400–600 USDC |
| Advanced RE | Ön incelemeye göre | 800 USDC+ |

Başarı kriteri işe yazılır: *üzerinde anlaşılan hata giderilir ve müşterinin test ortamında aynı işlem çalışır.* Sözleşmede olmayan hatalar kapsam dışı.
