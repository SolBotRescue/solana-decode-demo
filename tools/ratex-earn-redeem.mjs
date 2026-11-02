#!/usr/bin/env node
/**
 * ratex-earn-redeem.mjs — build (and optionally simulate) a RateX EarnRedeem for an expired
 * PT position, without the RateX frontend.
 *
 * Why this exists: RateX's app is gone. The program is alive and the instruction is callable,
 * but the account list is easy to get wrong in a way that fails with an unrelated-looking
 * Anchor error. The layout below was taken verbatim from a real successful EarnRedeem
 * transaction, not inferred from a bundle, and it is verified by simulation.
 *
 *   node ratex-earn-redeem.mjs <market> <wallet>            # simulate, print the payout
 *   node ratex-earn-redeem.mjs <market> <wallet> --json     # print the pieces for your own tx
 *
 * Markets are listed in MARKETS: 45 expired markets across 12 assets. Each asset has its own
 * RateX program id (the vanity `Rate…` addresses), which is why programId is per-market.
 * The haircut is PER MARKET, not protocol-wide - measured 0.1149% on xSOL-2609 and hyUSD-2609
 * but 8.23% on USD*-2608 in the same session, so always read the number before signing.
 *
 *   node ratex-earn-redeem.mjs <wallet>                    # scan: what does this wallet hold?

 *
 * Exit: 0 ok, 2 nothing to redeem, 3 simulation failed.
 * No dependencies beyond Node 18.
 */
import crypto from "crypto";
import fs from "fs";

const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const DISC = "5da23a014b12d442"; // global:earn_redeem
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_P = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYS = "11111111111111111111111111111111";
const PRICE = "f9823edafdffffff0000000000000000"; // u128 seen in the real tx

const MARKETS = {
  "xSOL-2510": { programId: "rateqk9kmMstT8SdVDyiV81Wuv4snjYyBjYoPkGqywK", state: "DE6wBXUNR6TC57ipVmRHyvTA9a3Yu4gGLkeEegejK381", baseMarginVault: "Beb89qAb171gTUg2GaQMGSZqYCNYR7JUeNRUNymUCN5Q", yieldMarket: "9Cx58EsJiSMZNY17Pp5Pjj1CYVicQwg9kMpb1KJ4u7kp", earnMarginMarket: "F3kFL3kHCY5odp1Y7EJk28NYWAgZgNEFqVjpgdi61Pty", earnMarginVault: "8h8b5chceiE4tieHHPkg39eqbMmJdjwDseSntjcBTZ3r", earnVault: "7JiWvjyAeniKJg9PiWDQbtkefnEihFzyumSGEfgh6Z4z", oracle: "ByYbuosBhSAgifsTaNpYQw63NPKoTUPShLVHCzQbMDGX", observation: "En41UsQGJnT1vJNqAbabjg4oyDuP6hSf4xXNFRPxc6H3", ymBaseVault: "AqxsKwL27Kefros83REdqCDo78cwKF5aGkeMhjGs7FJa", poolVaultBase: "BrCz75cfTKGgb8NogLwkPr9L4qqx4fXcompGFxXAppB8", ymQuoteVault: "4Dv6hYpN3v7BtS6uuoCW89Y8SjqeaEWst9zngtPyZH5o", poolVaultQuote: "9v5rzK3yxRJ95e2H2egx62day3Y1pcugSWbp2q3bChBx", ptMint: "81yT9sAUAWgFBuEW5sDMzjewxpAgmC3PeqTnmDX1oeUV", outMint: "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", tickArray: "42UA5sKs1V39J5rymCtKE8GjGAn9vBCkCkvxFquYnDFQ" },
  "xSOL-2511": { programId: "rateqk9kmMstT8SdVDyiV81Wuv4snjYyBjYoPkGqywK", state: "DE6wBXUNR6TC57ipVmRHyvTA9a3Yu4gGLkeEegejK381", baseMarginVault: "Beb89qAb171gTUg2GaQMGSZqYCNYR7JUeNRUNymUCN5Q", yieldMarket: "75GErKAmb1nCS3ppwhmerAKqWBQdAwXdpUpr2cWUkNvT", earnMarginMarket: "3F6YSEDYKh65V3XmuLzSFWyN3Jw6weiHWJqBb1RvhKbU", earnMarginVault: "GU94H3S5bwxyZ6i8FFSdHL9JFgJSAwzMuECKoHWUbSsD", earnVault: "8oV5ujZ3xkwR3Ewskiab2EHbEhJxsZUzHDt7R7nntiSA", oracle: "4dK3N3boUfNcx3Z4tW8nXKtLFSBDLuVFJmSHrF973XSR", observation: "5hytNSK6aP7UppEDBumW2dX4UWpSNSpfwxWY4uPMXSrK", ymBaseVault: "ARC9wcGuu8L3wZh4RM6hrrJJwTZ8M9FiQ6gK9mRJMD9R", poolVaultBase: "91g26YM3CgjdTpP2B2P3kLh9wAHsV7vTLH1rfqX27U1y", ymQuoteVault: "5aui9kGP6VoGABeizXRCdXhshHkhqU7um6xsfY3pbuvE", poolVaultQuote: "G3CptmG8KBSJg3AM2TdpZ76rPZAr6qpiCrLo4QTMuP8i", ptMint: "CpqiKSHuEeP3YHUHF1oMkheQJ6PbZ13ASkMdiXR6jJQ3", outMint: "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", tickArray: "V2Q2EFpDG6zNH4g9Xs23oGCmW72ehF9tPPcdL8Dk6F1" },
  "xSOL-2601": { programId: "rateqk9kmMstT8SdVDyiV81Wuv4snjYyBjYoPkGqywK", state: "DE6wBXUNR6TC57ipVmRHyvTA9a3Yu4gGLkeEegejK381", baseMarginVault: "Beb89qAb171gTUg2GaQMGSZqYCNYR7JUeNRUNymUCN5Q", yieldMarket: "AuH5omaehDYx8wMH1Vbcvv6MPbqhoLWhBz4K52vb4acC", earnMarginMarket: "4czZSZ14F8Bmp53GuVuGKWYhdEyGRnXtvTG3TmP5cvf9", earnMarginVault: "HZbdedpFw6Mz46uD1QDwUVUkH4nV5cfPDmsKAaYxS1gG", earnVault: "8CXfcVL4oqBU4nmu3tV7Zgp5FuGL8vCcTShdrgqzKP48", oracle: "4oRrq8EjwwtuP8E2Vbuyw2sijzhB5e7aCUGrYsLvYraN", observation: "8FGkd8pEQik9C1m4Z9oQw7kqU5XncJtJvs6yQATiUXXr", ymBaseVault: "6X3EBCSRt6omvKpN9fMm6Jwxo6LbsPHnACUTs28rS1gj", poolVaultBase: "EavduBUmFH8daJDC6ujydKuHyEK8sg6NmywdqeQb5vWa", ymQuoteVault: "DEFH2AbSN5UG3Aq93fWoSHUkejbJyddu7NxJ2Z3sc5CE", poolVaultQuote: "SfnGot1pxKpdWaTMgavw2mqq21Wy2sadLggD73VkUWz", ptMint: "3RALPaNFZbfvrMk3dFakDHSBHv7f6R9pQ5gcHvpZYk9c", outMint: "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", tickArray: "AHz9A3tYGFoJdLiptZzyBRtC6HfqTHSgcR3YWwQ7SYyX" },
  "xSOL-2604": { programId: "rateqk9kmMstT8SdVDyiV81Wuv4snjYyBjYoPkGqywK", state: "DE6wBXUNR6TC57ipVmRHyvTA9a3Yu4gGLkeEegejK381", baseMarginVault: "Beb89qAb171gTUg2GaQMGSZqYCNYR7JUeNRUNymUCN5Q", yieldMarket: "2HpPZVdSeGkxBSBo3QLZohDkuMF7w3upvGYgNZXi4TQZ", earnMarginMarket: "2WSyZrpeJRQ8XMXBHuAtpbHo3pneT6J8WBWNgQg8Zaz9", earnMarginVault: "AoxU7izXosfiqRocw6QEwGmzwJhSpSA7xaUmweJtR67K", earnVault: "HDmygtTj9hcV4eKicK7ZqNjxgkQs6vsNuGUqxfuk4wvw", oracle: "CjJFtfG5iiSgq1nuGqu2pKTGS6hFSEfuMzDSLC7HHES3", observation: "AuoSZETpCWsLLLE4SaxW4Fw6tFeLuxcG5TFvnDhvWmRK", ymBaseVault: "CBkjjc49xZ5gnxmWs4t2JLfuxXWDMPHfsVagEnrVtZmg", poolVaultBase: "FeeCn6Uq3AqjYSQNCz53rC1bY3vzcAjth2wgDXjF6unT", ymQuoteVault: "FRkwxiEiFycEjjqFogaY5ggMdVKdDwSJo1oBvJepV8kD", poolVaultQuote: "3JM97rovYkp1oHVygCYdvfpMFUVJuR1W8EPRKBr9gZ3e", ptMint: "7unas46TRngwSZ5bDpaL2y2tth5nAMSuCY4wbuKgMsTf", outMint: "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", tickArray: "F64ywhP6xHvQVeFcCKzQAuYtVhKiJ29FDmpPUYoNd2wK" },
  "xSOL-2609": { programId: "rateqk9kmMstT8SdVDyiV81Wuv4snjYyBjYoPkGqywK", state: "DE6wBXUNR6TC57ipVmRHyvTA9a3Yu4gGLkeEegejK381", baseMarginVault: "Beb89qAb171gTUg2GaQMGSZqYCNYR7JUeNRUNymUCN5Q", yieldMarket: "EzjUdASWwhXZWHfrSqKR7QkfCwXuDzkM5D9E46pX6C8K", earnMarginMarket: "BycZiB9QJNd3zXqwioyyj8QUGmPo9xSYzvr16eVSXezv", earnMarginVault: "9ZkzgS6gvkCZQgS5pg5bJdPKcu8QCCpQGHez592PtDzM", earnVault: "5xgnw3RoRXir5qbQVBTWVea6qtDuNmgy8YQpZHtS8hG", oracle: "BRS1ntVX6ubUSGFoXsbK3XAbh5g28hyNHP19mMUX8o9p", observation: "HRXtTu6u538vmNNqCRCPRhyHxJai8fRfVxD4BiyMBNka", ymBaseVault: "DGm463HQagBq9ocLbSrw7ds5pGxDQEJPiWr6nqjR3PSR", poolVaultBase: "Afwz5ZrXBXSUFUqAFXAh6MnMtid4SAAXqmwfSyUgjQjA", ymQuoteVault: "HmQ5MZ35kg6UKg2X6396bTuS9MzyaymxDnwHQPNrvgKQ", poolVaultQuote: "B81bSvZ5Z4rqUyJV5hMTXrmyJNwA4Nq2NpYmWQuEx6Ud", ptMint: "3VXjUPCYmW4oWrVDtJ6gfRZzRfnmumFttkVKAcn7YU7v", outMint: "4sWNB8zGWHkh6UnmwiEtzNxL4XrN7uK9tosbESbJFfVs", tickArray: "HY8KRjaGnWZN4pf4QpQk3fB5d8YWd7ZdxyoQrQPvkQzT" },
  "hyUSD-2510": { programId: "RatEqyzDoJW8bAk2dBp9rTZCYykhLxt4P7CDxodKK1L", state: "CXUwpGUAckfSWotqrCi5TpNbBgeFRfSrJQ1N4iXjCBWu", baseMarginVault: "67YVDnoE23ykH5fNgocmLL8VrMzd9nAXi4jtyYEKM3X1", yieldMarket: "5PHeEdS9sduLTetfM8FpKKHLoijcf2epSUjfaz9Vjscm", earnMarginMarket: "CxWEmqMPFkDSMfuN2VuwHfLzzQZmK2mKsxLtRkCUXrzK", earnMarginVault: "54m3FnCcJmGtUjirQdCdnDozYdmosw3eRUkh4fmX9Qrr", earnVault: "GMWtawiFvkqq6Kz3sFfPwN5c2fXkgbJx2yvt6RAgcgbj", oracle: "5ZSbmVadpoi6WPkEcwdWwZJbMWdTm4NGXLtJ3sBpascu", observation: "xLuQkMPEY3A9J5vntUXQ1EHgjJeRdMDmHVfrie87T3F", ymBaseVault: "94fz6Fi4PMnH851SiUuZD3R3KMhEcSi3daLe5cT9VrEG", poolVaultBase: "33jxfzLLgYEo2z5cHUSfM9iVZSwSd7ow1A56RjXbcXoz", ymQuoteVault: "CuHFkv3LBEkD6h5bYsxnNNgoc12DtXLiPLfkZRjZe57R", poolVaultQuote: "BNfMVCdX9wbgcEnzHpQr8Kbbi7g9XH9aZWwLFBDqPXD5", ptMint: "5FsJYsRzc44NKhTKEvJe4oQqh5Ydi6rrg4VFaTxu7NVd", outMint: "5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E", tickArray: "FgYVC6RoZAkb1qiCDQVR81VZhiPs7A78ajJbLQjkBvyL" },
  "hyUSD-2601": { programId: "RatEqyzDoJW8bAk2dBp9rTZCYykhLxt4P7CDxodKK1L", state: "CXUwpGUAckfSWotqrCi5TpNbBgeFRfSrJQ1N4iXjCBWu", baseMarginVault: "67YVDnoE23ykH5fNgocmLL8VrMzd9nAXi4jtyYEKM3X1", yieldMarket: "E6q1qyNReQf3CBvWiye3xwZm3vD72iDbmqatqTtqNB7p", earnMarginMarket: "656GDhqa7uicZ9YBoA6zEBPccU4YzCNRvncpXMSCtfC6", earnMarginVault: "HzDCNJAnW28dmhvg1zZ3bBm3RqwGLMqh1Qmt9YhVjZmc", earnVault: "JAt3GsDcm3dPRv1dRhNSyNZHtKtSBpQRixCjkUoU1F4f", oracle: "96vhWw5NEZfCCA8iSzqGTmkaDRQDgM1a4nt3a1y4Rhgo", observation: "H6qm2okRRKgCxtX2AgMts6xdY1PCPET8JjVpZu5rbqW9", ymBaseVault: "CLNfg3DMhwhw9E7EvxacS8fvbUktHeqRtuMdGAZp23JU", poolVaultBase: "5EFJECWFJA5XecypcT18nD7goUq7Fu3U9TsteiRH5wEk", ymQuoteVault: "3jcP14GZhZGHh2qizAHZWYuS65PVRkdScsx7RwnkimSr", poolVaultQuote: "DGgj5mgfbqghHarmTF821dD8PkjGAp6FTKBR4NALaoui", ptMint: "CW5HCcetvCMcT8B44P3kakBtQzdC5Jqpyv3ZPyj5HvQB", outMint: "5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E", tickArray: "EengbhyoGpWW4Ti8eaRYLwQsW3bARntdhQcaftSqHPvF" },
  "hyUSD-2604": { programId: "RatEqyzDoJW8bAk2dBp9rTZCYykhLxt4P7CDxodKK1L", state: "CXUwpGUAckfSWotqrCi5TpNbBgeFRfSrJQ1N4iXjCBWu", baseMarginVault: "67YVDnoE23ykH5fNgocmLL8VrMzd9nAXi4jtyYEKM3X1", yieldMarket: "GNaCXHBVDZDZQn38fSKtkMAzDWwzovKKSCAn6gEyGyJP", earnMarginMarket: "H8Nc9G9gpNgefbZ1qieGXE9PRk1LjjuB2V6EcTxcfWJw", earnMarginVault: "GughnxV8PpCjUZycxq99jJUw9fnFnR29QYL1smFmzAHD", earnVault: "32TN9nGP8uKaaCaNUbU1XbnsxqNJcH593XY2CVvPV59u", oracle: "7Hpep1wF2YPpBWroz6LEfZV5Ry8ywoUWkvHACo95cPxf", observation: "7iDFVhx45Gggd7qAJEVfE79ih5BrELtuqWnkkcLN5VEK", ymBaseVault: "52NXHuQH6bKXHdZ7aZYcqiRPZgxUYsGHbNAtQ3VKMSYP", poolVaultBase: "CDvYVyv4pnFts8CcNtisz69nyGeqtyCL3LQYgcHQHcLZ", ymQuoteVault: "dKBWqFP2nYBKVjhUBYA1nNySC3q2Pv9coJUiM5WMv6x", poolVaultQuote: "263kR5D2GvtNhhqXxgR9Gt9Zb6KC2AeU1cyPdAhdm4xp", ptMint: "68YNuzt33gnbve6yThSJcW8A9xYsrMGNnHjQmNEyYAzJ", outMint: "5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E", tickArray: "4JTbbhoquxDPYV9S8CwVKUMb2PY6euArpsxKxtonruQ8" },
  "hyUSD-2609": { programId: "RatEqyzDoJW8bAk2dBp9rTZCYykhLxt4P7CDxodKK1L", state: "CXUwpGUAckfSWotqrCi5TpNbBgeFRfSrJQ1N4iXjCBWu", baseMarginVault: "67YVDnoE23ykH5fNgocmLL8VrMzd9nAXi4jtyYEKM3X1", yieldMarket: "9LJfTxrBQAdLncB35P6tDgyjfvxgJKfSc4kKk5DzHPbH", earnMarginMarket: "FkaCwz8jccYDJ3HUTLyYB6wN5NXWVcHQyX7aCU17MJQC", earnMarginVault: "FDfEPARDCQEzzCWMT3uJ3f89SJSZv2kQiBXFdpZQAaFC", earnVault: "5WKPFchP8F9hiWKvc4BqNC47JLHhxwENYANsMC7e8u6t", oracle: "F7s9BAfayyq7NEdruSw25EiNugTpJ3ofS89WVCBexd1q", observation: "4qZJpwFfpMYL1a4FjzQ1oBUHYTstRuiNZ4YA7262AotW", ymBaseVault: "5HoGLSqJDPxfaEBX6Ay1LAQ5XFmEbXn8Ug2DSNgtrmL", poolVaultBase: "8a46KJU8BL24ytczEP5sane4ZXLPwFjGVCCePbydCBCx", ymQuoteVault: "5p5aZeGunRRoXYpGDr1DM8tnzNgcjCs6XfgkCF3vjYiH", poolVaultQuote: "BHDEttYyqYi9KrUB4K9cj1Q9D5DP6iFvj8wpZNjyTh4F", ptMint: "2itaTbbAikn74ZnBTzUV2gqZXKQZD8fdJ8oebw64rWxG", outMint: "5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E", tickArray: "BB3Ab8KLHhU36BnrgigFCfJSdERnZhMPQHaNAT2bkLAk" },
  "sHYUSD-2510": { programId: "raTeAJ92EGM17TBENyDNvrsjmhhujvaanXCFKuxF494", state: "DUNRQTjC2dfZxGpyPQJgKRjqqJtbwRbwD9YEsFCHUzWP", baseMarginVault: "B5W6B5bNSraVKSFLYkovCkfrBbqWfGuNnuNnRBfnDmg3", yieldMarket: "5HZiG57HcAeGQwpk15KqBiDc3mtCjGpGHrdhARcVkEuB", earnMarginMarket: "5E982xjCnGyScgS5XonMosq5m5Eppumxc1n7rEnutTKF", earnMarginVault: "4apT3dtUW59XEJnztsvr8CKKUWNKymjg6vroLrNZRjhf", earnVault: "AsXYBMha8JAUzNMJfHwFK7kV1eGe61wsZ7zzFtCtCj8p", oracle: "5x1kQaWMUZJAK8X6xAna6iKfPtaA6qbTuUAwvvHcSe6n", observation: "5waj5woGxH7eYU7nuGrBH4EdbNRUbZphTMXsZT4zrfbc", ymBaseVault: "GiUsQbc8AtKiSUTSWX11rV6r9LTMuzL6dJ7kGmAauf42", poolVaultBase: "6SMBGt6c8deJNgJLa3V1SaEQQjh1o17qcGUZwUyEkxPA", ymQuoteVault: "6bJX4toANSB2sYcCYsyGjrKL16X9pS8RJdKpBMS8GVdq", poolVaultQuote: "7V4EQwMDxqkC3rWz9uPr5XVUEUjnsyv9UibSexQUiGBy", ptMint: "FSGWCMvsxYTQKWtDa9fz7rNWQB31X674q62LbmSPRMu9", outMint: "HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz", tickArray: "2ei44kqYT9FhSiGr3oLpWtLQqVMYk5sp7x8Br421DcuK" },
  "sHYUSD-2601": { programId: "raTeAJ92EGM17TBENyDNvrsjmhhujvaanXCFKuxF494", state: "DUNRQTjC2dfZxGpyPQJgKRjqqJtbwRbwD9YEsFCHUzWP", baseMarginVault: "B5W6B5bNSraVKSFLYkovCkfrBbqWfGuNnuNnRBfnDmg3", yieldMarket: "A6S5ov1wz7rPBeHTqRCDUbqwwsMJbThAEcu6oiG5DSBP", earnMarginMarket: "ExRUuZ7wUcqxarEMyhKUcZ9zpSva3bSVfuFvQdSVa2Pe", earnMarginVault: "2nisDCnN5TETg7auUSDebBe5Z9TipYbECmS1DugXP2XT", earnVault: "34Gwd5pFBnc46qUdknjueZaFJmFHqJ7nCu62oDuyB492", oracle: "2TMqSB7fFiRcnuZqxuGACJKcdmtzjJGA9pzPYumQTtaN", observation: "FNTPnE6BUfjNvqERfznAJWwAy8SgihS3K9yYL2n6nPcF", ymBaseVault: "H3mxc2YneYetpNouYiJk6ePcd4qFPEvXetneiDi7cRbv", poolVaultBase: "4mR4NLDhUap9zVAv1kvRooppG7m1TBLq7QWnx71pYTQn", ymQuoteVault: "5wUti8eJzrHBvtTDxxwg5avwkPutxqcCayoAX3bN9i72", poolVaultQuote: "BkDrDzPzS2xh3WbFwNyQWtpPugyNs3tpsmTK71iBtjnv", ptMint: "AvZqwxqWXuEW3hJD1A4Ve8bPbeb3xQTiGuyHuTnr5DPk", outMint: "HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz", tickArray: "fPvV2MNf7ym3FvN8c6ACRxpYjP6bhExZAdpgqomtPrC" },
  "sHYUSD-2604": { programId: "raTeAJ92EGM17TBENyDNvrsjmhhujvaanXCFKuxF494", state: "DUNRQTjC2dfZxGpyPQJgKRjqqJtbwRbwD9YEsFCHUzWP", baseMarginVault: "B5W6B5bNSraVKSFLYkovCkfrBbqWfGuNnuNnRBfnDmg3", yieldMarket: "4d7RmCRvGVZFKUZA6aQ4ofxvZm5HrVwUj21BHazMpkHb", earnMarginMarket: "GQGDpQ6jnBH3fCg1yfaWYk8HZXXWmTLxswxC4XnaXN2x", earnMarginVault: "3SXErfQRzNpkcatYbUGVk41x9utcVyfprXVhTV1XK8nj", earnVault: "9jjeHGnUo5RP5tSQnqccT2a8dBSJUoswxbYgnfcveKEG", oracle: "EgLno3ffYVBHiwBMN2qeHWuVYJDgurf8BtssABC9mSqf", observation: "EatFcgUoTKpsrZwusBL5pfeXVP5JM5CUjxwfjyAG9GqT", ymBaseVault: "4wLsc9Q9oshhVPZa1p9dtuY3dBsiEAwuooy7uBaMc7uv", poolVaultBase: "EqkgntaEeRnpoAJd3Lbfm2dShHee1Jt6axTNYvgxqL1H", ymQuoteVault: "Ev1mkhqLBYMPdUZ8FdEcFXskMp7N9ig2qneQvL1nCrgL", poolVaultQuote: "CpWtm26SG9PtkEuZfcbXCVLmDuTu7uYBu7SyAH9L6giT", ptMint: "GTqHwSwqKmSpuFQ2TJ5hxHA3KDFeX5DYUqaafwvmvy39", outMint: "HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz", tickArray: "5x3bqyvKyJWLndEE3XsE4hEmwq8BqhHEF7DH3EsMCkE4" },
  "sHYUSD-2609": { programId: "raTeAJ92EGM17TBENyDNvrsjmhhujvaanXCFKuxF494", state: "DUNRQTjC2dfZxGpyPQJgKRjqqJtbwRbwD9YEsFCHUzWP", baseMarginVault: "B5W6B5bNSraVKSFLYkovCkfrBbqWfGuNnuNnRBfnDmg3", yieldMarket: "U5hazEgnvAYrMmBFAnQwBpHD3UNZmpnHwXQpW7ML4P4", earnMarginMarket: "GxWPUwSAxkmgbAAkAPX9sHJCkNZnLoejT2ppn5PCMyWe", earnMarginVault: "5etnmNbe5XbkC8VMvTS6DutJZZXm3S4WDyEbJVdtPWa2", earnVault: "D59zQh5pPXEkicqCX8bnZvcD3UxhXSzY247TZv8xLmQi", oracle: "FVt73fmYt9r1QSU6yawELBYQn3W2tuDyUj4hXvsHF1iG", observation: "Bi4uwpgkW5Uo5X8kZHggR43ZkAfdju56VAy27XYNyESf", ymBaseVault: "97pYazdneQveZPoJp9qa6ANvCDB2owMmFqarW2cGwj9R", poolVaultBase: "9MUncaK1RMXcrVvCxvGkWDNNCaqquPqM3WBMonq64wre", ymQuoteVault: "Hid6EcHf4ToBoGqDFJaCf5aV2VUnTdcjaYhJMUU6zzmA", poolVaultQuote: "2nrVfGe6U6xwgvC2g3vG45iHZ3hypYKPEHC4whYwxFTo", ptMint: "9cGNAu2xEDPMq55T3b2FGfQJHdG8tbWC8Sn7PYq7roSs", outMint: "HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz", tickArray: "6vVjwRAZk8sje7CqXFCbNakZDt2qz1AtCL6pZfQ3Vakc" },
  "hyloSOL-2511": { programId: "rAte14X4CFgBXqPLEhmcLxkXVRoFthL3fcbBHVuvmxo", state: "42Tss68WfbTE2XAz3AZMCYM8s6zZrxP5ZS57xoA4isMm", baseMarginVault: "DoJK2e6pxwcYEQhXFzoHWvt1T9VepX3kdptdu4QbZDE5", yieldMarket: "2dWQj1f4bR8jvAb6vMxTuagSqTpVwogBjQo2nzMqTdXJ", earnMarginMarket: "2j9EC2HxvfFA9LuTSJvyDAZ8joLxFPYAoy9Y5RDT8X7a", earnMarginVault: "Q6b9pcsUnTKHdJQFMJU5P5KKsg7VPzCXRFr1ojEPxtJ", earnVault: "6i2VFwz7nsmoyvUcW1mZhazsgGxTCAX9JMzrFqoZEwM2", oracle: "3dKptjkxavNE5nepRxg9QDJRbYrXJ174YdhzXCFMjn5V", observation: "J5tuBYcq9wxhUcqeicY4r4zE2SCsbzXvTjAykEq5ZBga", ymBaseVault: "A5aQenEwxNJ3gF8ZdxYH3pEoQPbqGMeYpiAJjWUK9FV5", poolVaultBase: "A3pMNob1o6TzQanhx53Dq3yCnwjxv1gfFpYC9MQjueyb", ymQuoteVault: "A46WSMmtqNc6qErLRQ8tuUmYugyC5exDeRpYpgKWxJbZ", poolVaultQuote: "Eg9fmLwji1Mx5FncAezB8puNdk9cDkqWHuTKXtkmyBpW", ptMint: "AtgBbGZk8GoEATp6i2EosrrdrYBhLEEiA5pKTSfTEDcq", outMint: "hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT", tickArray: "7xhBmB3UBFFx9N17eTE3HtyGpgmeUjSjV16JmTKRd4zA" },
  "hyloSOL-2601": { programId: "rAte14X4CFgBXqPLEhmcLxkXVRoFthL3fcbBHVuvmxo", state: "42Tss68WfbTE2XAz3AZMCYM8s6zZrxP5ZS57xoA4isMm", baseMarginVault: "DoJK2e6pxwcYEQhXFzoHWvt1T9VepX3kdptdu4QbZDE5", yieldMarket: "HNBC2LbYHvao34imgMtJ8aj7jyjuk5E4vDJsnR2LGvEp", earnMarginMarket: "eWKfqCR53egmHQMd6Cr8GjYxMWevUY2u1VoqZg1qAAd", earnMarginVault: "7Cu4zeVSx5TitBwV55HamwxaR6Ych34MDzvdjNcoNn78", earnVault: "EnC6vGHz2myebE4XTyekncDCpqb2LDmSxj4iaedd31by", oracle: "DFxWN6hz5zMa7tQLQp843A4JrG7Zv28pPF4KUVcaGJVB", observation: "HLpSND8v4159j2qmHjTBK2sS222nqbQHyMSjpitxWq3m", ymBaseVault: "qJtvw1vB3bZzbLuasStSi2i2P5TWk6Qwcs6sci2HZ3r", poolVaultBase: "FzAryYVyGfzKa1CejLbhkLwc8jPEDnF1uiuhFdiEr3ao", ymQuoteVault: "8ygVcDwPdeAj1hDBUpqNHPGM8gX9nBxWDAfLWjiF8MZG", poolVaultQuote: "5k3RFQgpZs9SNDELbLBEjgKgJrrJQHc4ntZ9Vp3vuiTp", ptMint: "2xokWZxF9jtoLU8xPNKR74ATgVuczmkNKdhk1g3EjyNe", outMint: "hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT", tickArray: "FQghf2C8LHxzuzQwHwrRif7q3STvQ2MS6t5BPdfES5sn" },
  "hyloSOL-2602": { programId: "rAte14X4CFgBXqPLEhmcLxkXVRoFthL3fcbBHVuvmxo", state: "42Tss68WfbTE2XAz3AZMCYM8s6zZrxP5ZS57xoA4isMm", baseMarginVault: "DoJK2e6pxwcYEQhXFzoHWvt1T9VepX3kdptdu4QbZDE5", yieldMarket: "7xcV2MCvS97NdJNiRZCiQMKAJURLLR8SkGqzoYsiLXhm", earnMarginMarket: "Acs8fKSRVwXARsXP7ZyaK92XD6PRDbYYAodq4xuXZ7nC", earnMarginVault: "HvCrsqBokqMZoxRDq7YfziExHKVi8HmUfXDNe1zQNgE3", earnVault: "DiUh8rpUDbL2pDhzc6R76uXv9BwgMyQFdHw99v9dJ1oh", oracle: "HeeVstjxuQAWeWNzyyaR8Psrk3RwNgNu9t37ZMfxyTMr", observation: "G9H9XxyE5sxvxrho5RtrWdBd5aym4RS5mGpsgh5Tj7bK", ymBaseVault: "HsAFneV3avKKmamFQFFdyiMnu4tCQcD4KnbEZcej27fE", poolVaultBase: "6xxdn5K3hg5nfvHQsh51wUUbbEURF5pZovVA7rXmtqXC", ymQuoteVault: "68DsvfJ3VaWhU9FXSrTZmXfc8bBPRdcqYg2AR579yUZs", poolVaultQuote: "3tmBD5WMst4CyUX16mYSXqhcMz92hKWRo16bKteSDwHZ", ptMint: "8itRK32BzrZTpXpqrX2QRpbvqD6SVGBZ74N3HbRV7BgV", outMint: "hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT", tickArray: "6Cbixnbh33JJpEeDswCQLb2X8r4LahffuQNGsNd4qkPT" },
  "hyloSOL-2604": { programId: "rAte14X4CFgBXqPLEhmcLxkXVRoFthL3fcbBHVuvmxo", state: "42Tss68WfbTE2XAz3AZMCYM8s6zZrxP5ZS57xoA4isMm", baseMarginVault: "DoJK2e6pxwcYEQhXFzoHWvt1T9VepX3kdptdu4QbZDE5", yieldMarket: "Fzr5TuuBF5uHeQZdERHAkum7ZH9R62ESBGUU4Hzc8ySB", earnMarginMarket: "8p1TmsyFVwSMoEy5QsHNxiwzTnoK8yYwjJ23GKxoyh6d", earnMarginVault: "21wHF2VZDYdhhWdP7b1J1nqyfvsDypYnmexEVPH4J1cG", earnVault: "G1gMPdi7mz2YdXVnBnUVQeLXL9tJjypEt8ZHdanKncYb", oracle: "8gWpLKsYm7wwZ4VqauUYJqTwxnmp17pYfPCvqqv3wmHX", observation: "7K5S12zUp6y7BuyrXfTXu453tFa5rnz9VN97HD4uKt3q", ymBaseVault: "EHDfAGXjSvkZPRVnMsjswuGGBB1zbKFkuU2zdQogtN8k", poolVaultBase: "5wTQGdzVyYkG7NiehwMnk41XCVyLnjV8Mku623W9pPNv", ymQuoteVault: "2yXsoqSdaYKLnUqMCkq1LM7Fbpwqjv3eVsysEf7uTA8S", poolVaultQuote: "97zKx1G5t3iJkwRpEpus9n7xQmVKmCwmmLq1woa5mZzX", ptMint: "5HuzEYVGzdkzhjsEiqF8Nt6ncu6H9zEAcnsYfEcreLjZ", outMint: "hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT", tickArray: "AGtSHv4MBoc8e8bAa6e5tvAcmzYs9XEQGK7ND9HbMSBb" },
  "hyloSOL-2609": { programId: "rAte14X4CFgBXqPLEhmcLxkXVRoFthL3fcbBHVuvmxo", state: "42Tss68WfbTE2XAz3AZMCYM8s6zZrxP5ZS57xoA4isMm", baseMarginVault: "DoJK2e6pxwcYEQhXFzoHWvt1T9VepX3kdptdu4QbZDE5", yieldMarket: "Cgy4SVzoEuB1GVqkixCHj5h67xxfYF3c4ds5LMvNp9xD", earnMarginMarket: "6ykwHwRvYBPfXGFtqc8Dwswk5Hw2Yzqm4w4fRMXB83u7", earnMarginVault: "7pXphsJJCSvvogws5Cod89in8oLg11cHPZe2K88jzkT1", earnVault: "9AFrgaB15J5SUxGEdAcq3MtB3kWbCR4hAJ6jTVnujfBV", oracle: "HcwQJ6ShU569tytC96DNouTMUsUEqcSTc99BCgY1Wz6Z", observation: "HQfZ9amQqCB7aihs6pqYsrmRuTZX6uhUk3Yja6cmH8fe", ymBaseVault: "2d6FF1exoA5iqP3WZ4p8bdwhJPJMWHbB5whM85UYQvmF", poolVaultBase: "AHUPXnuSTnsjxunqjktXfVVtgTq5kwn9bwmbz53PosU8", ymQuoteVault: "8fRLMYZHPX9q3Hcs5onF52eeY1aCSQbHeXfcs84ywQFp", poolVaultQuote: "E59arWwUvujpQVxnL7jgEsYtBBb8rNRrkZgNix8mg7PA", ptMint: "7dJKWjj7vtHFyXkknQ2UhrEq4PgmBkKXE2RRNvV3274T", outMint: "hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT", tickArray: "ACapxJLrACGKD3XFhELcVXdPo8yRqw5ref5AWCkEN4sK" },
  "hyloSOL+-2511": { programId: "raTEMK3K8ahgwLuWUHEvp7aJXjVmcbNgj8XmQVMgt5q", state: "H8ojDwxW9Bzy8tEGXnPqsHzuJvnhGwkkkEgoQqzhjBeb", baseMarginVault: "7JtBwiWVejSswRVzxn9v6H5penQ8Hk935j5N6y1vviWu", yieldMarket: "72N1SoXnFV9GjKbcdvfUx7gTKaqVSjFHGHax6w1SL7j9", earnMarginMarket: "eg2Pmo188N5nztbaPjZbSHeJfQB4G6zvYhPjcAW3pgj", earnMarginVault: "9WukKJBhtiKSDC22JmHoNDTDZ8bsn58doZAiUKUyN2Fi", earnVault: "9gofJxJrpNwTVG8t62oqu3Yudb8qusyUu4Y7zMV76473", oracle: "GodQPfEZ9RoV9upsrbnVEoAPztMgbF3yqBQjiCzRYNoG", observation: "12qNrLgMa9MidRw7k8m13rdz5X7ZXtosYc1iyAL1nwBz", ymBaseVault: "9fJk3TPveSDVgM2yKdso15YRJrTkzaTwWEycXqiMr5Q6", poolVaultBase: "EmkYrqdv78s9n1YHQmB68spxfyeRsUcHvZNG1ea9XGp2", ymQuoteVault: "BJjQuwAhaDFGmU92sTARnntayZCsek31R5dmwTJYDBUF", poolVaultQuote: "3nSa2VADTC34hSCK1czcc1DxB3zM3LK5HTZG8FkrE3WP", ptMint: "41BjxgvxkGm2ELJ7v4UD9erxePieitpvzGKsQdaC1euu", outMint: "hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u", tickArray: "HmqYTxHqNrFtEcK3NGTqoMeNTugse7qcMMczjWjBZVMg" },
  "hyloSOL+-2602": { programId: "raTEMK3K8ahgwLuWUHEvp7aJXjVmcbNgj8XmQVMgt5q", state: "H8ojDwxW9Bzy8tEGXnPqsHzuJvnhGwkkkEgoQqzhjBeb", baseMarginVault: "7JtBwiWVejSswRVzxn9v6H5penQ8Hk935j5N6y1vviWu", yieldMarket: "HriPzMQhpaTa88hAumqFjM7X8okGoRg47dniBoWJ1Bdk", earnMarginMarket: "4LW8uEVUuWKYwzWxUXNH51YcfpMtDFu9iU1xWHgZTEs7", earnMarginVault: "2ELfBcgDoZsi2ufV75jyXyZVNSK5gL18MRL7cx6trX3m", earnVault: "AmFymfahPwBq8jTarLufGzczSRkmLsRzN6zLd7WAVQDP", oracle: "BHzZFSWFmANHMwsrEgKbRtZrcKphGvY2anWYBfJdWFUC", observation: "AUk9ZtXVygzHa4b6PaKAKvVz3mde8yzz8z8A3cSELoXB", ymBaseVault: "FLrPYUdTM7iNxTRCnbDZusbHGUUuaVuEm6Y772w8aqMQ", poolVaultBase: "7EquFtm5z2fCQFtpmZov6cA8FGLwQ5m7DEzjSJfZRQYz", ymQuoteVault: "ChtZcUxWBwLejgddzP7kEWgbnpGaYJgMSm9XhQ9v7xj3", poolVaultQuote: "71HZTSzd7Mui5oqLiouX65avTZ4HYrCA6ciBnEefBdFf", ptMint: "ELGrDyWig797iBduJzd2MstBa6jBmYT5iJAAqpv9mFZ", outMint: "hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u", tickArray: "2XAZ9aGnQ1SvJdQoL3w1WxcVN7uUS2MyEDqTMsEPwugx" },
  "hyloSOL+-2604": { programId: "raTEMK3K8ahgwLuWUHEvp7aJXjVmcbNgj8XmQVMgt5q", state: "H8ojDwxW9Bzy8tEGXnPqsHzuJvnhGwkkkEgoQqzhjBeb", baseMarginVault: "7JtBwiWVejSswRVzxn9v6H5penQ8Hk935j5N6y1vviWu", yieldMarket: "GPEaVECktjQsj8Rmq8XPfZoMJhcHTrPVE9Tqg4BvLVxU", earnMarginMarket: "HXkpfFCDFVMSdtq7X1UhWJ3upaTd9L7884fCv1NfAvr5", earnMarginVault: "CTA9jPk7Mk86pMkAJecGwT3aPj2M1Ckqv9PDwr2rWkoG", earnVault: "9DHuqu3NDgHxAh6uZc9Cc4kz72v53wBaKq2XGzS7iCVL", oracle: "BZ3hFBPnNJxZM2Ls4Rj47fXytYQg5SbwhFYF2B9TWP7K", observation: "CwSNPMqYUYUK9rZEfWddRkNLR4z3pQDEFFQ5FsecRBbk", ymBaseVault: "6fHovdBkwWQT9uFCQSvrZ9rx32r3TRrmaSKwocVQhTm6", poolVaultBase: "9B168Nuu3MvrVx37PFfE3cWr7QhB22JUmt12mfVccoPH", ymQuoteVault: "H8U8ELU1owrdW3oVyWfFBKDxh51YY26PZPqWBjz1ssqD", poolVaultQuote: "EnFsJnPJyUzRkS3dPx5fG3sngkLJLmP9AF1DYAwV5aS", ptMint: "6k5ktWhTo61yzSGG8s8kA2zi72vHFN81AFWGwXBwtYKm", outMint: "hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u", tickArray: "28TNyoz5v8ywv8Putc87wh2SwyqsmYEk4EgzHeqJNNt8" },
  "hyloSOL+-2609": { programId: "raTEMK3K8ahgwLuWUHEvp7aJXjVmcbNgj8XmQVMgt5q", state: "H8ojDwxW9Bzy8tEGXnPqsHzuJvnhGwkkkEgoQqzhjBeb", baseMarginVault: "7JtBwiWVejSswRVzxn9v6H5penQ8Hk935j5N6y1vviWu", yieldMarket: "EicY5YtVqzJjRQKMS7EQnKwSk7EFFy8LBoQwvRBw9ytB", earnMarginMarket: "BprCANNYS4Jnzpzr6Lp5KrKKpFcaepFq9yFtm5qtjS9", earnMarginVault: "AczYU8QXgB4asqesT6zuaQzXqWHC2jb4PqrTXfHR2mPn", earnVault: "B8zjFS7NJpYb4YWBGPoMw8kiE8cFEned3riEhiUBz5Pp", oracle: "EM1xC2rRYuj4LoRFEyLTvCgjhvqphwbxcwBkYpGXDkNB", observation: "CEjgYepCTdSob8NCJTJHHbPvvb54cLrxstT3PCY7gswB", ymBaseVault: "3vC1gfvBo8eRXVwCLiCcrkHNDxYfnD9zEfJyGpdD8ePk", poolVaultBase: "Em9Nai4kTDDMkyBHnkNtTfWPHazvvhK95ivBwHt5rZaX", ymQuoteVault: "Gsf8dxWwi1ygPB2mLVL6gTJvm7AXsFMmFYHwtX4UyL2z", poolVaultQuote: "3xYW7DMw61kaefA357y863bby6tFjtANRe7z4258pLsy", ptMint: "9jKZjjU1sofktzzoRxWSid8rHgBcKfAs2yQX12N4vujB", outMint: "hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u", tickArray: "5bgh7CeNKXdaQWMsFmK2ia7QTVx3sy5uDitgFH8Z2ynm" },
  "USD*-2512": { programId: "RateFzvQT8Dz2HqDHAQj22ujp8B5kaBm2FUUkSoLgZm", state: "5qnaX4nUZWiBhehs7ocJzbXPsehYasQAQpyiRzqypeaR", baseMarginVault: "FsjRiUDdFoKqdTqCDg3dm5uVjeZZr9D1o4PpLCV6NkwP", yieldMarket: "8P17171nEmtu8n8YgdPmmBdATgf1jDuRysmLFwUCt27W", earnMarginMarket: "6ZDvhHk7FpQwGMYVwLBruL24AhorEvrkt5hp1ak4Jwxk", earnMarginVault: "ARukAajNcfx4bKGdjahi4MJoekwT61UGiTJAvfUkPVkv", earnVault: "AWhyVmFfFhd2ETHiopZURQwe34ivpXN2zGuHZRn3h5pw", oracle: "EuAn8ixZSaGmWia11gVMhANXqKNs2TfLHg8x5twzxr3x", observation: "8mCdVdA5BfmUNZqovcvYKxd5bwb3TFfcDpEZ7U6Yq9kM", ymBaseVault: "7hHNDppcMAKchFzLcumEDboAgNXFvMDmkuWyNf1ekcp3", poolVaultBase: "2MuQmAePVZKe3eiZWCVGJKC3cg16DgeuwuApt2hSRt4a", ymQuoteVault: "3m71dk4k2PKbu2hqzUikFnFi3XZNQCmc7ynvP3uKcBfV", poolVaultQuote: "b2U9dcrdpzs2tpvxqWoG14M4r6inEMRMEH7kgMo7zw7", ptMint: "D1XhYyvKoEhWy7XfeLjH1KJdfk5xJCDGXZL1kkB5x2xa", outMint: "star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM", tickArray: "Hyh1LBGPQrEMToD9V9Tqybaj5fQxohD7G2kwDKoLa9eo" },
  "USD*-2603": { programId: "RateFzvQT8Dz2HqDHAQj22ujp8B5kaBm2FUUkSoLgZm", state: "5qnaX4nUZWiBhehs7ocJzbXPsehYasQAQpyiRzqypeaR", baseMarginVault: "FsjRiUDdFoKqdTqCDg3dm5uVjeZZr9D1o4PpLCV6NkwP", yieldMarket: "DxsueqHYCGT2rnZhQB3dpFptXEJrBSKp9v1AYxuLKSRm", earnMarginMarket: "5c8jdzq85FW8W73Nv9pcVp1qPG46Y2EQ4BVMptAr7XFu", earnMarginVault: "C3JoFaqf78FoXMLsLHd7DrGwEALNUY82Ye3rHEPodw5i", earnVault: "7SXW1dHQvZGeg5DbcSttvt1tsEGAFhTZoiuU7JRD75aC", oracle: "5fFLxwpPJhsVYBAhGq7EV6dUazTcWin3yKwj3cXz1n1C", observation: "2dYecvKRFh1r3H6Qoz59nkcYJotbXEbQw98SS1Vkzt63", ymBaseVault: "2z71pRTdh1pivVcZyYEHnzfbseGwEQkLRP5xNVHrtUdm", poolVaultBase: "FwymbSot1xGRXPqe61vaDRF6LT3vGPphv7VK4A1J4Svm", ymQuoteVault: "4M3dei2ysDBggunfpdRvy4u3hpJDk5ToYQvqY6DwTXq6", poolVaultQuote: "8T5a3PTTpVunhqFX9HJ9c7y78Wn81eyfYCcHGN4N8bVK", ptMint: "HKu5QftCkG1tLrwufnP1jHJWRjHRUNyJWYzLA2LFF9Mq", outMint: "star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM", tickArray: "DF192gzwVXKv4gtRCQLW1Emd79iMo5X5Phc8NLrLdX7o" },
  "USD*-2608": { programId: "RateFzvQT8Dz2HqDHAQj22ujp8B5kaBm2FUUkSoLgZm", state: "5qnaX4nUZWiBhehs7ocJzbXPsehYasQAQpyiRzqypeaR", baseMarginVault: "FsjRiUDdFoKqdTqCDg3dm5uVjeZZr9D1o4PpLCV6NkwP", yieldMarket: "5oLmX6W329rvGUzibnkuhexotz3pHM7SkkMQzSmkQUZ1", earnMarginMarket: "GxpBp1rRP1yJ23SfaWHoyNPmH9FikuZDx6iciiPWoYNL", earnMarginVault: "5Z7JUbkW6hRp47XTS8LRjWHeWWoFZzmvx38fzwCnKq1A", earnVault: "FDjd1m64dZMtGkTWwFkWA3seknPUxyqCttsErV8ZJryk", oracle: "Dq4kBkeMYgNFznH6vbMNj5xLqP29QrkRWoNvrrEwhXTz", observation: "8yZtn8GWuNbHGmuWfX2XV2FL7oeoQVaL1wUXSUEPY3B9", ymBaseVault: "AzymsMMmeb1yENpU2WCoh1BjVNhmSvV7kZErPxzjxMsH", poolVaultBase: "75KSjg7ZB3XCEWrAGGLvgjUdRUPx5NpUq1LBWzuHdfmt", ymQuoteVault: "3UNWd8dDNLHxe12j8ytXD3NAVDBmKunzadFkz1YJiFsZ", poolVaultQuote: "4nBnKwsvdg8awLqJFCHLe4JRmVL3CE6QyDyZxHcegUDw", ptMint: "3xEQvqRoVkr1xbe3644drxEQrdi3o89rcQ3xq219dpMx", outMint: "star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM", tickArray: "HA7T8FudJCW7VsNXmvPd2cXhc4gN1ecUK4k3ZD5XUxnM" },
  "PST-2510": { programId: "RatE8tuHWtSQSHqk9dtcZKQipUJfZXMvjxqFQuAjMnL", state: "BuH4Fy2DqrF2H6o75iJ1BTadhTZXGwk45JKxzbdBvfAe", baseMarginVault: "Bs5UK9Xcdvnt7WaZ7gB5vmupZmoz1VSqBFiGpk9bfNhM", yieldMarket: "23ruqMah7VxPZyUb4BqTBzRNPLQ7RC48Yx27p1Stw3Ga", earnMarginMarket: "FJyi5YGRiWdXG332yZAccymSFtw7mz7ZeqaKFDQueVZL", earnMarginVault: "8g3ZMtmrpqy78ZA7HsRtzGEQgpfjsTFjp9NSNh2fZsR6", earnVault: "8HadPZFMHGzXGMNgbPmR63zZFr77XBKqEUJhJYmkPHk", oracle: "6y4iPhtxasmQN2MNNCYH5WYJ2awiq97NAoQs35X8d8KQ", observation: "Gr3YTWX6mnsMJme1aDT1pabPHpCjuY7jpFhtHUcv3NMu", ymBaseVault: "3QeXqSx2zib6v4t3TNjSF4sGxdFkiakKRytDKxahAGRn", poolVaultBase: "4JHNSvFKjquy48en1yCEf9NsqvWA355YJq4hUyKaGoB2", ymQuoteVault: "81rdbHtWWbg3hjuuQvC8NyNgBpoBFaiZtyoDZcNKKVZ2", poolVaultQuote: "2kRrcn2mP7nXmGRAJ8xSzFtLdn93Czp5t25rDMyYGhxn", ptMint: "AfC9nF128ZfRJrjbuipoiHuZVFvKTWNBMY53oW8PbFNy", outMint: "59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw", tickArray: "E42iQnoesx822ZgmPAT2VAUC7TGYQ93vxwyZWvxdCvfQ" },
  "PST-2603": { programId: "RatE8tuHWtSQSHqk9dtcZKQipUJfZXMvjxqFQuAjMnL", state: "BuH4Fy2DqrF2H6o75iJ1BTadhTZXGwk45JKxzbdBvfAe", baseMarginVault: "Bs5UK9Xcdvnt7WaZ7gB5vmupZmoz1VSqBFiGpk9bfNhM", yieldMarket: "FmUFvWEejdKQoiUYqjTu37jiBZmo1bav5QDU2HUYi6jS", earnMarginMarket: "8LgUw334btwBLyY2bPQipUc1eHVLag56iJaPygmmGaVZ", earnMarginVault: "DSN3B5ymsNDMVemSNTN2dv9UaQErybusLco52pxvV4dM", earnVault: "Bu9rNTUrvBBTguxAxwJHqduA8FB1mPZuKPv7QC5z3W8Q", oracle: "FoNZwptCQAERjVQBE2gSTbePDbesYByPcM69hEy8QSDE", observation: "E97vA1vi91PRirnK6qdNKJdnDdxKiS7YL2sr2LZx6geo", ymBaseVault: "87H26rXaSewwZ7fQQo7BRvccgGpCt6ZdRg2ioUX2NtrJ", poolVaultBase: "FGseWaePRnUgPpGPu4jWWhk6TcHWqkJpi3r6ZVUR4dUU", ymQuoteVault: "3Qvo8tmKFFdrsuV8Nq74mHbC8VGfEMhViYGTJNRQsbai", poolVaultQuote: "HXjZ5dMPjDGWunxfR8vF9hZo22NpUzvxd6eTYQHHEWSd", ptMint: "ATwUJh67itLThdNHcjorSFZhUQFr9E3QXhy3yAXu8Y9K", outMint: "59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw", tickArray: "CK5C1SNTShmrEVHA56ZvEH1VRMRoudbCYL18sANX7QbU" },
  "PST-2609": { programId: "RatE8tuHWtSQSHqk9dtcZKQipUJfZXMvjxqFQuAjMnL", state: "BuH4Fy2DqrF2H6o75iJ1BTadhTZXGwk45JKxzbdBvfAe", baseMarginVault: "Bs5UK9Xcdvnt7WaZ7gB5vmupZmoz1VSqBFiGpk9bfNhM", yieldMarket: "GGbdks68MwZpuJcbQVbddmffTMb3L8H5Y24CCRJ3Sqcn", earnMarginMarket: "5ZyJcV7ABh39xX6F4SSCAvifaf2aKceokw18PorKHWPy", earnMarginVault: "83YyTH5PpKysH4zzY6eiCyCZu7wSwVDvjU5nMMksjBsY", earnVault: "8ad1qm24UBfAWiwPa3mt2b7msXbjEhuHkA2fbyhSVAaB", oracle: "FE5NUbY7xVc6vbcvdEcxFJtqdroU3WeddSmXqDNuRP9Y", observation: "VaDEWHzDX11j8AN9KJjziPoFwqKWbPahqiYhmHixuKT", ymBaseVault: "HSXVcgQR3LnFiKb2DTkyVXiwsJNmQyCvZt6qXkGkwggG", poolVaultBase: "BEZRj11EhxJoMFyjLoqLSLyK9Hf39jBKHAZu4mpRoF9X", ymQuoteVault: "G1w1d8ZvkdGufdNcd7U9CUh4iGpqMtAA5RnBPz38pA33", poolVaultQuote: "4AG3MgX9e7idEwDmHXXCUzrtCryeJZD7YkojmxVyCVuh", ptMint: "67YnQhHSEU4mSWiH3pKV8HaR1ZAtJDcweEN4fNRRigki", outMint: "59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw", tickArray: "HbV28JsaxNjLGadwU4VCBtP5eE4gwWFCvoW6yKCng1GX" },
  "sUSDu-2510": { programId: "RAte2gSaXmo5YSbpGHDKpK64J7frAmonHBpi4odtyRV", state: "Fb4ED6wg4cNvboUpHjAVrAmPDDqJUkGaBYhRjXZtqxyh", baseMarginVault: "9PE2rpHFKxUmNUCMsAw9Tq7GLcASpY6d1XiFitG5NRj7", yieldMarket: "5wcof14ow4ZSzD75v3SxoiLoevW4M7daGAxMuzc5w4w6", earnMarginMarket: "Ben5uhY6kAwLQ2dK91tMQvf1XrR3gBkodksthJWHN8Kr", earnMarginVault: "4w4oKooXViHXjhapcwMAEpbopkWohGU1sUunMxDkCms1", earnVault: "7SAHptWEQc2asUJXeYgVgdFVubKeSWFh6R7xZrewbMfK", oracle: "3APpxHyuKJ2Q3P1i3PVAUNx2RMdtox8q6JHWPd6MoPt9", observation: "3aXjd8iTgMcso9RWTGEx5EEPyKHExTcdHWdQRT8BHs48", ymBaseVault: "E44A3HHvXrE4caaeaqNiZqo8CajyH2J7UbiATyPR8qQg", poolVaultBase: "DFV1FkUv5msFsDttpMMz9zEuke6iLFXAdYZsauE8AXBs", ymQuoteVault: "39XspPvdDT6t8tMPc9yL1mGENMUgtJpVDmuGujEuXM7K", poolVaultQuote: "DB3HtYAZZJ8fWAth9YSEwyEmwWZzL3XDbxztpoEkyB44", ptMint: "AuLjgdQ1zhaQS3qEyGebnJ9Fi43HYUtspd5KiNV6qWtM", outMint: "9iq5Q33RSiz1WcupHAQKbHBZkpn92UxBG2HfPWAZhMCa", tickArray: "8iwuVtRVtcc1PsuYGQ2Qe41M78y3UsB96xiKkGMeyyNc" },
  "sUSDu-2603": { programId: "RAte2gSaXmo5YSbpGHDKpK64J7frAmonHBpi4odtyRV", state: "Fb4ED6wg4cNvboUpHjAVrAmPDDqJUkGaBYhRjXZtqxyh", baseMarginVault: "9PE2rpHFKxUmNUCMsAw9Tq7GLcASpY6d1XiFitG5NRj7", yieldMarket: "HvXWC92DVzGbHCyk6mJHFNJDqpLHaDQPjwnRZESMo6sv", earnMarginMarket: "EStF1guuXAXqiVFqW6TdjehGcyy8RYPdRJXA7E2pxcdZ", earnMarginVault: "pntaZ8b3ivQHoKCh4zV6qb18QxoVQEVM1y8MQWVNtpY", earnVault: "E2eEMg5tXRHBwCdoZ2Zx9WLxLQpebHCsMM4MbtJG5q3", oracle: "PRu95jGHfg1gsjv674Gek1TKEohzBMVs3tKEpA4B3Pp", observation: "4QjMrdR5Lu82rNKVhnrdDbXU1AAHgEFavuDFnxUgysAJ", ymBaseVault: "H3hqtnaq5yMmCawwuah42nsf82kx8o91Rf43R1mvxrus", poolVaultBase: "J9eu5E48n8Ga4BeYxnJzbompB4vnv6tjiAxAptjtLYWw", ymQuoteVault: "6EhzFR6j1V92zC3E9HS9QBti9H2SRNi4CCtaxAeNDodS", poolVaultQuote: "EaChAn3UWoS2vQopK5d3VmvgNg8Q6vTzwG3GQEGsVmKU", ptMint: "9RGq8375ZPzcwnjkzUVpcT4KXE8ZhsTjZo6gsfMCmoRp", outMint: "9iq5Q33RSiz1WcupHAQKbHBZkpn92UxBG2HfPWAZhMCa", tickArray: "C3TtQnmr3BxuAetcQakfFsamFUDxjs92y8cKvzG8joNd" },
  "sUSDu-2607": { programId: "RAte2gSaXmo5YSbpGHDKpK64J7frAmonHBpi4odtyRV", state: "Fb4ED6wg4cNvboUpHjAVrAmPDDqJUkGaBYhRjXZtqxyh", baseMarginVault: "9PE2rpHFKxUmNUCMsAw9Tq7GLcASpY6d1XiFitG5NRj7", yieldMarket: "BSFBfwAQuCR1pGNFn3JeQJNdaw52phb5EnLeTHAXJNbD", earnMarginMarket: "HMsNNezvpyGKtga9x9a3H72GhkPtPTFPH6uL3Hmd5TD9", earnMarginVault: "61zed1apjh4yk4BUaNrWmAM2tBMSQ66PLs56Ko2qgzZS", earnVault: "J9oRjsaTsRSipYyCgW6jCgjAjssKaajmPeoUnP7NGZUv", oracle: "8oVY8j5DMxHMzGDCPrxaUuFYL8sBEMLnF2hXwbYdejpF", observation: "BdpUg3MBcoHfTVh5EwTANWBHQZ8cxRXd265C9TotBHth", ymBaseVault: "9YXvjAAXucNLpby49rPVYqfTgqQtHeKWGpyk7o9CnySB", poolVaultBase: "EaMSDGLLa3Fpx9MkTLzz36kegvhEQfszK5PKYteE6oFS", ymQuoteVault: "FLfy9JJGbPYnPaAmQvGWJr7s5yEKJXXhwU7KCPayyjUM", poolVaultQuote: "FCfqDfACZXrh9yMp8nspsBuv3wFyjiQcqBCUXFYPcPsx", ptMint: "81oyH9Vm9QrTPXyFm9sHqC1BNRQzTLHpVjken9Dw3ufC", outMint: "9iq5Q33RSiz1WcupHAQKbHBZkpn92UxBG2HfPWAZhMCa", tickArray: "77wEcZpmkYqm8btZb3KFew3v71GfUeRrT6eV7WqrDQWj" },
  "sUSDu-2610": { programId: "RAte2gSaXmo5YSbpGHDKpK64J7frAmonHBpi4odtyRV", state: "Fb4ED6wg4cNvboUpHjAVrAmPDDqJUkGaBYhRjXZtqxyh", baseMarginVault: "9PE2rpHFKxUmNUCMsAw9Tq7GLcASpY6d1XiFitG5NRj7", yieldMarket: "2sMvC9KrD2cubbd4FC2LadZjBEFVvJpHBkbh2yHRqXfV", earnMarginMarket: "GPfvSFEfjxRHzevuUZedmrDjdse3FRtJHfzEfY45pMpd", earnMarginVault: "ChMXBoqpdrdU2T5Er9CFBC4YdoHk6qiuTj33Mga9df2g", earnVault: "9jfQLn7YcpBaYZRCiDcB56bzqxxxXcQXBFFSMN1XQLaB", oracle: "ARjeeaZU9EYBXbYBUfsi1KgUH9FcQxMHVc3mbHATrTko", observation: "DNwgctZ1iZW2W7NtP8zhWzqkrW7KdQNtpQkyMuHW1C2y", ymBaseVault: "BS693GTjfrgjDwQcqrDanuQzwtS9ACG8dykjYXiuMwPB", poolVaultBase: "3sEm6uqFTzu7GqXacLMmaeFxewmUBCuYzxLga1GFSWSP", ymQuoteVault: "2n98wgYZyZYqsodAQ4N5BkZduaFbA7ZvYVf3CCVWgS8X", poolVaultQuote: "46coR28NTZtrGLdiUfkzcmHHV1pFm1TTM8Vk4Eqd4tJ5", ptMint: "4WBvMashzwcxb89Sagq216AM7skNw69qwdCAFY32MQVZ", outMint: "9iq5Q33RSiz1WcupHAQKbHBZkpn92UxBG2HfPWAZhMCa", tickArray: "Gh1Ji3M4CvEZsGXDsSiceGRJio9hATcWRkinREwX5wy3" },
  "ONyc-2601": { programId: "raTEkEMFeDsvsELyQ5CMk4dS8Yhh3wyXXRL6QESd7p2", state: "4Xq71JsD35o7bxkiBxBWEsA6o4vx42wvpSH111GXqZRR", baseMarginVault: "cXibYqogDMSm2uVoNwzFvQdyPJdMWxTR4g4PXpVcTiV", yieldMarket: "DvFXzrq6ZMnarrAp7bQt1s2XCnVqRYzXgvqvqoF8hbnA", earnMarginMarket: "CgBx4muA9xEYr187L2jGWYaq325CEubqeLT3iKazqJYc", earnMarginVault: "Fh7jJMyRCLfjub1fhevgpyLfvxm6ZMhXt1UQpyMxyxp1", earnVault: "CiSdgcbXAYxWUU1upTXUSdNVKFHrBkmHvheJoZwA9FLm", oracle: "4oAS2x5vQ76PAnNY26fhxBuT5esnD6QwuNait4j4mXB9", observation: "HfBRHupsK1Ue1VKCk1XhfETC4XC49KKhobKUD5ZBj3Zm", ymBaseVault: "7NJgHaHqwxac9zicKkH17e8rr7UNaxiEaM3ohFfVm62c", poolVaultBase: "FjUizFN4w7ZYTdU7LtDJLvMUR2huPJ5zmPhB2UQ2tNqX", ymQuoteVault: "E5P9LmRrdxFPSfVFqBoAMmehTPf7buXzw52pXoEvY6u9", poolVaultQuote: "JEGXhJm28nvFbcXpuQ2JrGTJxiYH59VcKXar4DSyR3jT", ptMint: "8nwGg3MYRghtC1usypoSncsDwvveDfW3w9JvtCNTZ2dk", outMint: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", tickArray: "CX815ML4xW8WPujwdwTi5d7ccWWTu9RhmzxVric4GPHc" },
  "ONyc-2605": { programId: "raTEkEMFeDsvsELyQ5CMk4dS8Yhh3wyXXRL6QESd7p2", state: "4Xq71JsD35o7bxkiBxBWEsA6o4vx42wvpSH111GXqZRR", baseMarginVault: "cXibYqogDMSm2uVoNwzFvQdyPJdMWxTR4g4PXpVcTiV", yieldMarket: "bQhRrEYMB1bz7vyYhff9WaxE8ap9J9vWBYew9dpjBv5", earnMarginMarket: "HaePUBBMFqkC44JxyUvvYGT2YGuohW2evNbTM2K3Jd6L", earnMarginVault: "9izzDv825npbsXcc6o6J7iFjJXFtCDpfgE3fZyHPiVX7", earnVault: "B6jiVZta1pDtRizfTT8CzfGJhouZhH4DGghR4mEvMfYu", oracle: "FvAZYKMCmhZRHXdP8xkYZ7PFrp4uFgUY81UAX2ZXWXSn", observation: "41NCG4dPg8TJtDLXqh6xtL6zR3UyjCvMpnJkbHeboRhS", ymBaseVault: "GoB79vuggPbNxqvgSpT1dPWKpoMfQxitsW8hxUnTrDi3", poolVaultBase: "DYsaXR8h2ByzNo3G3LCMaJN7kkiwdGD65vfLww9UA91L", ymQuoteVault: "FoycnbCGGuiV56nxXZpjq8GNL4YFic55YeogZZLkvr6j", poolVaultQuote: "CWpMTs3DyQ1dY8iKkZ66htiKmQm1kcGuETyetLqkFv1q", ptMint: "JB39bb8fydGPGJN9qksF5BHmNXaEHC1DQfZy1YKzivJ1", outMint: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", tickArray: "GYTHJkj1tnCyfzQdqoD8qsYvLvrxgZZM6nUmNDJNs5tn" },
  "ONyc-2609": { programId: "raTEkEMFeDsvsELyQ5CMk4dS8Yhh3wyXXRL6QESd7p2", state: "4Xq71JsD35o7bxkiBxBWEsA6o4vx42wvpSH111GXqZRR", baseMarginVault: "cXibYqogDMSm2uVoNwzFvQdyPJdMWxTR4g4PXpVcTiV", yieldMarket: "E7EEmXQii7YNzMUW3X1HfueJotzEjSDL6ozm7oq2mdJ", earnMarginMarket: "8yCGb6bARxAG5xAxvfo8H3QxT7RE9dPad6f9mRKYKDFr", earnMarginVault: "27DixS8n3VYPHxUurHZgEFpUZdQfGBwLgFQNzJ56KMox", earnVault: "EQTswamzmnS8kWPJziTCJLpDT5UHot1Frfc6KXC8oNn8", oracle: "FcqYcefj4SVVFuA4HvU8ado83ZZstzp8pgSQtcG1Qexm", observation: "HtxS7j7RkRZ74VSrJtexR8Kj8gyCd6i2v7A1BVsU2E8y", ymBaseVault: "3KXu5R6jUF7MyuMDt7GM92CJqoPPMUhp4WmGu19pojAx", poolVaultBase: "DfWSebuPAjpxkgVMGKp5jUvaHjRnwL9N9vA9a9rguk97", ymQuoteVault: "ErnYCP4AGDV9c1h3HTco3JDUQJHheKwEw3N8fqdEHj8Y", poolVaultQuote: "DJj1vF7Kh6zKEpQM9CvNYbuwa3SKQLRTF4VwXZNgTn5D", ptMint: "7FbWfjanKYP9wQQjdDboLZFHiBQaCfhH8JBnazSx9bD5", outMint: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", tickArray: "7gA6jZnLHGKp1CHySGiN32MUT5cVN9wEJWdajZNeZS6B" },
  "fragSOL-2606": { programId: "rateE3GompDX8X8a6WEqwve7kge6YwCGEhN8krmTFjB", state: "ABKFTmaCph1ZFJMFrXo5CfpCs7nVs9Ts3bjsGCAM3uen", baseMarginVault: "EuGecp5LNLq9mqbnBRfC2CcB7eVRD6yuquHxGedkDJj7", yieldMarket: "5ajydpJQBfAaSW97vmALKc2qqQZ8kFQcqXugM7ULsuLQ", earnMarginMarket: "4nKtPiTayoW6xcKoPTt7QVasPqEUE43YHST9HyYZRFXo", earnMarginVault: "67NnUzanjX5eXs5Gs2jcwLpvPt9ZFXsgDCEqoE1Bk4fp", earnVault: "BGb2GyLJG82jXE8VA9DRnQUmr7KhH7mXETmNQWxXeMQS", oracle: "2AhZGdFEv71fXgqZ47RpncYzGvz7UPtCTdQoz2as8dK2", observation: "4aB4wmq4s179BQX6jYrggDjrTNCSkX89KoDktHCXkqur", ymBaseVault: "FBAqYEcwhGW9UY77KzRyf82EmAL14D9VcEUqKGCsaHLs", poolVaultBase: "6i4qTpxa5MhBYhYAYTbcd2v2SarZu9jZnyJA6njM22cs", ymQuoteVault: "9ox8ycQEiPqxe5u2DwUwJWKQ7LSSxP7wtEGb8nMFL1x", poolVaultQuote: "86ntLgKuGeXvM82i4V1z3sMdaBRnCCTih4ecQXZ1nutk", ptMint: "Gsp8s2DRLias5Gcewqcd2cRZrHyNnab7cZo1ydQ3MhLd", outMint: "WFRGSWjaz8tbAxsJitmbfRuFV2mSNwy7BMWcCwaA28U", tickArray: "6ruuwqsNnZtAN8wg1FjXzath71xEaBnXtAuUrtWdHp5J" },
  "fragBTC-2510": { programId: "RAtePjCQkLqCECgAWPgGaSje5rnoSbpHXc8HuBBZxaU", state: "6jXZn9DR19R4uw1968bpXrDTY5pfaQ6n8CMrEvAsa2N4", baseMarginVault: "A4NTUGEZBkSv5R4Es7TCEQ6f4u5XaGsZ1XNK6F7H7MxC", yieldMarket: "GEkVuB7mPNNCdHwYwo9iLr3RAYwc914HTPG5YVN2NXkQ", earnMarginMarket: "8QQ6osrZfevrAXyk8LLE2Hf2V85W8WvNnUSYJQWZXPnf", earnMarginVault: "Cp4mwwL8fMFcQqUutig1xC3QNmC7dccAgfaL4Qmww53k", earnVault: "AvDBbxUz3XjAmYTg6SrvLuFCSepovDx41UJx25NXB1wB", oracle: "6a1G1QiwvYNGDtJdK43EJNYgi1Fwi8ZQ8Msf866evY7V", observation: "AQ7rrdF62AADg2QkBVKMhsTRBrQXJPV48jtPVS8sSWgG", ymBaseVault: "5aRWWd8ihoDg69ZVP1THfrvAJ936W1bPNHBmuHs7iGGd", poolVaultBase: "HU1QPpXwFwFnSXUJaV1bfxSSjBhK6yoe5K5sLyv5PTRD", ymQuoteVault: "7ikgR9QoZhmfPugVAph7coYEkiWKZJnZDhwYDp3UHoic", poolVaultQuote: "ECc8UsvR3NETwGwrJuvddfyDjcSJvC445dPhjusctetq", ptMint: "9UJNHx5pfidfcxQT4QHqiece3EwVNw3x2Y7DMefAruWG", outMint: "WFRGB49tP8CdKubqCdt5Spo2BdGS4BpgoinNER5TYUm", tickArray: "EEZtVEwdYEVmaBZYyti1Tf8UGFkeG5QShPSEtSJYijoH" },
  "fragBTC-2601": { programId: "RAtePjCQkLqCECgAWPgGaSje5rnoSbpHXc8HuBBZxaU", state: "6jXZn9DR19R4uw1968bpXrDTY5pfaQ6n8CMrEvAsa2N4", baseMarginVault: "A4NTUGEZBkSv5R4Es7TCEQ6f4u5XaGsZ1XNK6F7H7MxC", yieldMarket: "DWNtGEMjzCoS6TTEKniA7tDyGBnb8oBDbBR7Qq8AVFYL", earnMarginMarket: "BQTFUUXZqeaqbB4L3DMzkknoP1dyXzc3ykYZKSVVPrjY", earnMarginVault: "BQY3uJAfqwUL1DGm6ca6qkdG3wdd8Hvfto8YSB6xzCaV", earnVault: "34LiYBMDFU64ycxJa9rUjzavhLgJWCptG9voGQeA7snD", oracle: "EZrB26VqEA9q6f6RhqPi4LjGHSPBkXfCkrAg4CUeLWeo", observation: "CrAb9LgyhTLTQjxXcKyX5iKpF1HgZBDVzWVkaWgErYQg", ymBaseVault: "DQZQNhPb3iGn5UoP54W1Fc5sssLCMAsPboFbDCUQsr6j", poolVaultBase: "FuoRhjYndSWTJjU1W12fXQ1h5bwqhsT4CMZRs3uXcSS1", ymQuoteVault: "2usbfcdPJWXZh6S7qj9wFn59ZjFSjwVgBG8i9XLqLwJZ", poolVaultQuote: "BJ46kXST5WXUDCy49T5XKDf2jts7x6mGZUEwW1b5ofjY", ptMint: "E21wktAmr1L1Rtp1PJrLoG5BmcSoxdLkBcxBroXkDFAc", outMint: "WFRGB49tP8CdKubqCdt5Spo2BdGS4BpgoinNER5TYUm", tickArray: "2j7FaASykMYLarDiStLLy7XLZYWKAmyDQoXmJ5huLiFH" },
  "fragBTC-2606": { programId: "RAtePjCQkLqCECgAWPgGaSje5rnoSbpHXc8HuBBZxaU", state: "6jXZn9DR19R4uw1968bpXrDTY5pfaQ6n8CMrEvAsa2N4", baseMarginVault: "A4NTUGEZBkSv5R4Es7TCEQ6f4u5XaGsZ1XNK6F7H7MxC", yieldMarket: "FBRURocCQ7z66dX3HhYeBA2SZV5R9wesDjwBPA35ezB1", earnMarginMarket: "3pHQnfoxXDJ3VrNLifHEKn9JfCJ125YGgroyKTaasagt", earnMarginVault: "Fv3bpkSStYYqNUJb8s4kSuBt85MrP9EVKwGy3En1bhex", earnVault: "FKrvu8wE9u6VbiRdvaPswvY8kHJ5Kpqc835mG4qDWYt6", oracle: "EVYxYcMGrgAHeSiakDTVmUFSvBnKL9ep215zWBS4u4QW", observation: "FNg9kUkAwFcQ9isStKbTdbL7H3pL7md5ncukxxmWkkKU", ymBaseVault: "6XCK91X55ZfEkAxdYBWwA3eA8E5duT18VhhBYg4j4FDF", poolVaultBase: "TvknPKfZ2tA5TLRFfB8sDcsKLuqLxL3MBBDTotj9fBY", ymQuoteVault: "BoV9kQarcbPeaLMbw43H5BJaBnDgruLoS5FQ4ZEa1c9L", poolVaultQuote: "7Kzf1K2QGm7aqnGFQiFhkN8XzJSMmxcJrW4rvsNq3fAH", ptMint: "4x4opeZczFPY22PVtJTctGoFA2ExKFhmyUwQqxQeCWro", outMint: "WFRGB49tP8CdKubqCdt5Spo2BdGS4BpgoinNER5TYUm", tickArray: "FfGht2nr4ixd2a1WE3c16Mb46RUs2mRoUu2EnwLHz189" },
  "JLP-2412": { programId: "RATEuvat8kBBvomUgsbGDS2EV4KjKCoMKCP3DpxYmF8", state: "26MtffGt5R9aMPcpesGEYuQD2BBhwzYXerKxUHfKLQ47", baseMarginVault: "4nyfJ4JBsRJLij7VGCVUeHwKSLAAku66ptJamoodY29L", yieldMarket: "4ojzVrwMG5Mb9Wwj4MAAuL8yCCMgRxc8tePTV8LRw8f4", earnMarginMarket: "9eWG4BcmxP85zidDaPMFdEgQ8XmoU5y8eJqKgUPCQf5w", earnMarginVault: "4Ejjk5w7HAWvmXYT57s5uwn8rs7i61nbpcTRQ9ABB11M", earnVault: "8Z2CuUNNBndx4drgkgJXRWkoeTZzriABhxpE1D3Uf5LG", oracle: "H69THULh9pCap9MLHHWW7CpMYLcvB2VMsoTmmP2AogNm", observation: "6R7QC7XoGiwzorR3YYPeMK3gYbvkEjewBUDmGWSNWQeJ", ymBaseVault: "DeRcUzH3ZGAAS5oTxecHHyAwWSNKfqZzzP4ZqApmTyCv", poolVaultBase: "D1oKaD95MADMkC3rd4WfZ5SJVU9ASJ9JAtP6S7CGQpJC", ymQuoteVault: "Ej8RDiKF3YmmrEnTFUsdcXMgrWnn2qDzjQCyyiosv75b", poolVaultQuote: "A6w3z62iBQK8NQ1cNCGkRQezbCtem6sz76u4NT1Bq5U7", ptMint: "vejC6Y624baymB9QJokpyiWcaEwQQfrpE8wWp9VbHdd", outMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", tickArray: "3N6BsaQUsH25qcD4PHnuCLvBcbAhGDPtcK9Trzu5jNna" },
  "JLP-2506": { programId: "RATEuvat8kBBvomUgsbGDS2EV4KjKCoMKCP3DpxYmF8", state: "26MtffGt5R9aMPcpesGEYuQD2BBhwzYXerKxUHfKLQ47", baseMarginVault: "4nyfJ4JBsRJLij7VGCVUeHwKSLAAku66ptJamoodY29L", yieldMarket: "Ddc5vvRCfTjTKnsPctpBdewTNvr3WUd2gitLt6eQC4Nm", earnMarginMarket: "39xKDCKnAREiKj4B3qgXRbjp9DkK4gSrof2UvEzwdZHw", earnMarginVault: "4FevMtxUTFwjn2TBgt2qhKcJHgUkXvXooP294uzt3vrL", earnVault: "F658dfuEW9kzhJEhvSLGPtX6TdDw6dLvDyWwEAuVuRYV", oracle: "6Rw7CgMbpJam9WHsVsrQyn4b1QNSeAwCtUd6PAQLsrHF", observation: "HUzAmUQfc6BeYfeoiTo5BhzP1nFeCBZCHuBq4fBREh42", ymBaseVault: "CcAMemXecNZgYwGAF3gETA8mtorD5WcFcg8y8AVmFU6j", poolVaultBase: "HGmhhDP66g63bCVAZyuqttxWJfF4urrg3kE91bFXyBpq", ymQuoteVault: "2hoSai2aCiW15dPV3wz7PrgjxzTJ6HgPxag3KsmtG2B4", poolVaultQuote: "Brn5syNX74rAMuoyb3C1NcAvpxnJTYF5tDHbKdmdhydX", ptMint: "4PuhHK9JELVpxrvVTVc8P2syiM8UnwLXbSFEe4whgRzJ", outMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", tickArray: "3QnPNThoivf6Vxxoyz4nJvPXd4FoazhqdeeRPKp2LvzA" },
  "JLP-2509": { programId: "RATEuvat8kBBvomUgsbGDS2EV4KjKCoMKCP3DpxYmF8", state: "26MtffGt5R9aMPcpesGEYuQD2BBhwzYXerKxUHfKLQ47", baseMarginVault: "4nyfJ4JBsRJLij7VGCVUeHwKSLAAku66ptJamoodY29L", yieldMarket: "2QwshcZqgrtnDbLDn6mN1GUA4HWX36SyRBeZTfcwCQCT", earnMarginMarket: "7TozXeSa5YW9QNt7Tp57FNH4PFAucggqqBMkBqDu5P61", earnMarginVault: "LeErPxaBemkosqD6gkSwVkB2At4QLSHXAgyHrs9jPjE", earnVault: "EarZ58iRVgoL26M6mD2qDX9HHFzkHYCXdKe8TbHPkgQB", oracle: "HKcg5AHcuPt75HDPhU1YgEpf3LNdu8c64UtGxn3X9MR", observation: "8GPbkRTQifshx1FMMXsYtMajPZFHxxmYGWCj5oDU1nDi", ymBaseVault: "8hsv5Pkt9CxnkfPF6tjeVb4eoE893ZuunYEnCxPuZYg6", poolVaultBase: "E6KtGxzk3qEALXA2VoHvMQ4da17aPb7TS2tHEukhdY2W", ymQuoteVault: "ECnjBgRBQCTARZXEss9iYKLgCP664M56Hyh4xfEWtUNg", poolVaultQuote: "bTemGxcXoQmJpGPvtxxbNc5zAEWg5pkbMxCgNwLSCBS", ptMint: "DQ73yU1skzx1fGB4tkF9reGAALeYxhxmR4rc88m16TdQ", outMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", tickArray: "DykxXawjMNwKUHuqqbdpo7nMvGLZUn94pw5oQuLB7dt5" },
  "JLP-2603": { programId: "RATEuvat8kBBvomUgsbGDS2EV4KjKCoMKCP3DpxYmF8", state: "26MtffGt5R9aMPcpesGEYuQD2BBhwzYXerKxUHfKLQ47", baseMarginVault: "4nyfJ4JBsRJLij7VGCVUeHwKSLAAku66ptJamoodY29L", yieldMarket: "886eenaoBuUcqcPVseTLTpiE9rLhgRSjRVs5UZSxrHG", earnMarginMarket: "FbdYhi7VT3wV5CA6F3XfQzSBnWjtaMn99gFeSVjHBE36", earnMarginVault: "6S4W8R93vWr5PML6QZykgz4mfLUJmHo3NXyemkNJGJgo", earnVault: "C1AYt6Fxppe3cUXx3yhNemzXukqKFZSZgS1MNokBTU8K", oracle: "5QQcJmEEpNo5BqRsSdp86i2r3rhnYBJsRrVFTR7enffq", observation: "GgV8VC45fG8PiySfDsBJmtho4xKnpHPXsyePvTyw3LR7", ymBaseVault: "7fEVjMyt5UzUm7QqtDPC3oR59SjFxBgbbHoYaGFNdNhU", poolVaultBase: "v5gZsV6P21iozZEwQQkJxUXPXC3yXLjNVZvuJNq6eyc", ymQuoteVault: "GqcnmuXTg7R9jVRAVkdQfja11yPgA62LcjXKb2SSbqQL", poolVaultQuote: "2jueTavEgeetmcaoEvkxfxEFiMcd7mmhWVc327nTZVkY", ptMint: "CL6sE8booyM8YcNeagfvUFxGtwC9csiDi6J9xUm3XMGa", outMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", tickArray: "A9kiuMapMU2H8g5bwZff8qPWxfqns47hNmVS6JBwyGCb" },
  "JLP-2606": { programId: "RATEuvat8kBBvomUgsbGDS2EV4KjKCoMKCP3DpxYmF8", state: "26MtffGt5R9aMPcpesGEYuQD2BBhwzYXerKxUHfKLQ47", baseMarginVault: "4nyfJ4JBsRJLij7VGCVUeHwKSLAAku66ptJamoodY29L", yieldMarket: "6x7yYXPbBe3oQm1L3c7a4UE9Lw2U3XVmxrokDr5UVwKA", earnMarginMarket: "9hJuiJg9P1ChTYAUaJW92pnM2B9wLFGMsHUGHxitx2fi", earnMarginVault: "ByZmEAv1LJ3HCUibDEhn1aaksgCYEMvTeQjtDv2QYhsp", earnVault: "ExxVkqCWAdyeLeDGNue581ZAPKrzzAAns9Qe1jdc3Rpx", oracle: "8QFfkWKbGi8mvixPmwSYBgiakLC1qXxn97HjzAXj3Fzm", observation: "8zXaruzuwe2Besf4bDiMKC8Yr4DLw88CHkZA4VHEVxiu", ymBaseVault: "HrwHE8i6EbYFmoYLvD6Yk6DRGRGVirzijp4MDHLYCnq9", poolVaultBase: "aWdDS97RwBSobUkM6UqoaAUvPmzmDwqu4ADnbAqzsKu", ymQuoteVault: "9ZmJ1DxZkCpeZXHuHSS9imc9c94W2Ze9yasPrYQ5AVBU", poolVaultQuote: "9VDW4q92vmFjxfrhNQAT7U7973w6z9s3nt37FFwW78Cj", ptMint: "8wZqX3dQuNCt3A6DWVwvS1CTn29wCS5cMwKTJ3RKT39H", outMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", tickArray: "5UZQrXkiiFQcJ62CTTTfvD1JBg6Ca9S2syU5zRqwUB7H" },
  "JLP-2612": { programId: "RATEuvat8kBBvomUgsbGDS2EV4KjKCoMKCP3DpxYmF8", state: "26MtffGt5R9aMPcpesGEYuQD2BBhwzYXerKxUHfKLQ47", baseMarginVault: "4nyfJ4JBsRJLij7VGCVUeHwKSLAAku66ptJamoodY29L", yieldMarket: "4a8TzcPaaP2Hd34Bxcv5djCrt8ipPLp7GtR5s1BwFoce", earnMarginMarket: "GsjwANgZURfkzsPv1sHeSFWbimEu4PQnE4BNPcdqGWGi", earnMarginVault: "EAB229phsm4m7i1cFcFTxjdSVbnxJXEftQkRWLGz6pMh", earnVault: "A9mGxQzE9gP8Fh5P96tiwcTczJEA47YFAPVP3uJ1MDcy", oracle: "2efDWtvyPjyQy4dGH26r5N8WjMCBKDfhPms3iL1xQr8k", observation: "DyrQrmQoDqgdPQmpAw7BPU16G3ov7YLPXgYHnAkaxqC5", ymBaseVault: "B1sKsqBS2sS248jzU6xLuE3Ee7i8QPYjKB3DV2kYFYrj", poolVaultBase: "4MfqMNHuMJ9i4979pbvzPS52WZuBykccSF3KmScsV4Ac", ymQuoteVault: "6f32tjPSjqtySMKitCANFkZqndTjcA132L6kBa9U4MXM", poolVaultQuote: "5ve2XfQXwWT3D1iGHcDzLhp7CHmZfquNVKN7GgU3ygQP", ptMint: "9g67ZPPk8wuinUJyTcfSydctGvETtQa969m7jmPULMVx", outMint: "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", tickArray: "5rEor4QAsuvybYEAT3LXfECkRzqUQwLx1E49X2gGaik6" },
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58d(s) {
  let n = 0n;
  for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error("bad base58"); n = n * 58n + BigInt(v); }
  const o = [];
  while (n > 0n) { o.push(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; o.push(0); }
  return Buffer.from(o.reverse());
}
function b58e(buf) {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; s = "1" + s; }
  return s || "1";
}
// findProgramAddress: bump from 255 down, append the bump as the LAST seed, and accept the
// first result that falls off the curve. Assumes no-collision (as the ATA program does).
function pda(seeds, program) {
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Buffer.from([bump]));
    h.update(program);
    h.update(Buffer.from("ProgramDerivedAddress"));
    const out = h.digest();
    if (!onCurve(out)) return out;
  }
  throw new Error("no viable bump");
}

// ed25519 decompression test: y^2 = x^3 + d x^2 + x  =>  x = sqrt(u/v), needs u/v to be a QR
function onCurve(buf) {
  const P = 2n ** 255n - 19n;
  const y = BigInt("0x" + Buffer.from(buf).reverse().toString("hex")) & ((1n << 255n) - 1n);
  if (y >= P) return false;
  const d = (-121665n * inv(121666n)) % P;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (d * y2 + 1n) % P;
  const x2 = (u * inv(v)) % P;
  if (x2 === 0n) return true;
  return pow(x2, (P - 1n) / 2n) === 1n; // Euler's criterion
}
function inv(a) {
  let [g, x, yy] = egcd(a % (2n ** 255n - 19n), 2n ** 255n - 19n);
  return x < 0n ? x + 2n ** 255n - 19n : x;
}
function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, yy] = egcd(b, a % b);
  return [g, yy, x - (a / b) * yy];
}
function pow(b, e) {
  const P = 2n ** 255n - 19n;
  let r = 1n; b %= P;
  while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
  return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let a = 0; a < 8; a++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    const j = await r.json();
    if (j.error) { if (process.env.DBG) console.log('RPCERR', method, JSON.stringify(j.error).slice(0,200)); await sleep(1200); continue; }
    return j.result;
  }
  return null;
}

// Scan: derive the PT ATA for every market and report the ones with a balance.
// The ATA derivation is offline, so this is one RPC call per market — cheap and quiet.
async function scan(wallet) {
  const w = b58d(wallet);
  const token = b58d(TOKEN);
  const ataProg = b58d(ATA_P);
  const found = [];
  const names = Object.keys(MARKETS);
  console.log(`scanning ${names.length} expired markets for ${wallet}\n`);

  for (const name of names) {
    const ptAta = b58e(pda([w, token, b58d(MARKETS[name].ptMint)], ataProg));
    const info = await rpc("getAccountInfo", [ptAta, { encoding: "base64" }]);
    if (!info?.value?.data?.[0]) continue;
    const bal = Buffer.from(info.value.data[0], "base64").readBigUInt64LE(64);
    if (bal === 0n) continue;
    found.push({ name, bal: Number(bal) / 1e9 });
    console.log(`  ${name.padEnd(14)} ${(Number(bal) / 1e9).toFixed(6)} PT`);
    await sleep(120);
  }

  if (!found.length) { console.log("nothing to redeem on this wallet"); process.exitCode = 2; return; }
  console.log(`\n${found.length} position(s) redeemable. Run one to see the payout:`);
  for (const f of found) console.log(`  node ratex-earn-redeem.mjs ${f.name} ${wallet}`);
}

async function main() {
  const argv = process.argv.slice(2);

  // scan mode: only a wallet given -> list every expired market it still holds, with payout
  if (argv.length === 1 || (argv[0] === "scan" && argv[1])) {
    const wallet = argv[0] === "scan" ? argv[1] : argv[0];
    return scan(wallet);
  }

  const [marketName, wallet] = argv;
  const m = MARKETS[marketName];
  if (!m || !wallet) {
    console.error("usage: node ratex-earn-redeem.mjs <market> <wallet> [--json]");
    console.error("       node ratex-earn-redeem.mjs <wallet>            # scan what you hold");
    process.exit(1);
  }
  const w = b58d(wallet);
  const ptAta = pda([w, b58d(TOKEN), b58d(m.ptMint)], b58d(ATA_P));
  const outAta = pda([w, b58d(TOKEN), b58d(m.outMint)], b58d(ATA_P));

  const info = await rpc("getAccountInfo", [b58e(ptAta), { encoding: "base64" }]);
  if (!info?.value) { console.log("no PT token account for this wallet/market"); process.exitCode = 2; return; }
  const bal = Buffer.from(info.value.data[0], "base64").readBigUInt64LE(64);
  if (bal === 0n) { console.log("PT balance is zero - nothing to redeem"); process.exitCode = 2; return; }

  const PROG = m.programId;
  const data = Buffer.alloc(32);
  Buffer.from(DISC, "hex").copy(data, 0);
  data.writeBigUInt64LE(bal, 8);
  Buffer.from(PRICE, "hex").copy(data, 16);

  // account order verbatim from a confirmed EarnRedeem; pt_mint must be writable (burn)
  const order = [
    [m.earnVault, 1], [m.state, 1], [wallet, 1, true],
    [TOKEN, 0], [m.baseMarginVault, 1], [m.yieldMarket, 1],
    [m.earnMarginMarket, 1], [m.earnMarginVault, 1],
    [b58e(outAta), 1], [b58e(outAta), 1],
    [m.oracle, 0], [m.observation, 1],
    [m.ymBaseVault, 1], [m.poolVaultBase, 1],
    [m.ymQuoteVault, 1], [m.poolVaultQuote, 1],
    [b58e(ptAta), 1], [m.ptMint, 1],
    [ATA_P, 0], [SYS, 0], [m.tickArray, 1],
  ];

  const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ payer: wallet, blockhash: bh.value.blockhash, ptBalance: bal.toString(), data: data.toString("base64"), accounts: order }, null, 2));
    return;
  }

  // Build a legacy message. Solana requires: signers first, then writable non-signers,
  // then readonly non-signers; the header counts each group.
  const uniq = [];
  for (const [k] of order) if (!uniq.includes(k)) uniq.push(k);
  if (!uniq.includes(PROG)) uniq.push(PROG);

  const isSigner = (k) => k === wallet;
  const isWritable = (k) => (order.find(([kk]) => kk === k)?.[1] ?? 0) === 1;
  const signers = uniq.filter(isSigner);
  const writable = uniq.filter((k) => !isSigner(k) && isWritable(k));
  const readonly = uniq.filter((k) => !isSigner(k) && !isWritable(k));
  const keys = [...signers, ...writable, ...readonly];
  const idx = new Map(keys.map((k, i) => [k, i]));

  const cu = (n) => (n < 0x80 ? Buffer.from([n]) : Buffer.from([(n & 0x7f) | 0x80, n >> 7]));

  const msg = Buffer.concat([
    Buffer.from([signers.length, 0, readonly.length]),
    cu(keys.length),
    ...keys.map((k) => b58d(k)),
    b58d(String(bh.value.blockhash)),
    cu(1),
    Buffer.from([idx.get(PROG)]),
    cu(order.length),
    ...order.map(([k]) => Buffer.from([idx.get(k)])),
    cu(data.length),
    data,
  ]);

  if (process.env.DBG) fs.writeFileSync("C:/Users/tri/Desktop/tasks/100d/msg.b64", txBytes.toString("base64"));
  // simulateTransaction takes a serialized TRANSACTION: sig count + zeroed signature + message
  const txBytes = Buffer.concat([cu(signers.length), ...signers.map(() => Buffer.alloc(64)), msg]);
  const sim = await rpc("simulateTransaction", [txBytes.toString("base64"), {
    encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed",
  }]);
  const res = sim?.value ?? sim ?? {};
  if (process.env.DBG) console.log('RAW KEYS:', Object.keys(sim || {}), JSON.stringify(sim).slice(0, 300));
  const log = (res.logs || []);
  const err = res.err ?? null;
  console.log("PT balance:", Number(bal) / 1e9);
  console.log("err:", JSON.stringify(err));
  log.filter((l) => /Redeem amount|redeem_ratio|expiry_fee|failed|Error|success/.test(l)).forEach((l) => console.log("  " + l));
  if (err) { process.exitCode = 3; return; }
  if (!log.length) console.log("  (node returned no logs)");
  const out = log.join(" ").match(/Redeem amount: (\d+)/);
  if (out) {
    const got = Number(out[1]) / 1e6; // xSOL is 6 dp, PT is 9
    const input = Number(bal) / 1e9;
    console.log(`\n=> ${got.toFixed(6)} out for ${input.toFixed(6)} PT (${(100 - (got / input) * 100).toFixed(4)}% haircut)`);
  }
}

main();
