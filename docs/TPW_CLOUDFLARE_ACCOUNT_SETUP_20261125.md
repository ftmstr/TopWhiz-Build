# TOPWHIZ — Cloudflare hesap hazırlığı ve kapalı pilot sözleşmesi (25.11.2026)

## Şimdi yapılabilecek işlemler (deployment yok)
1. https://dash.cloudflare.com/ üzerinden hesap açın veya mevcut hesabı kullanın; e-posta doğrulaması ve 2FA yapın. Kurtarma kodlarını çevrimdışı saklayın.
2. Workers & Pages, D1 ve Workflows menülerini inceleyin. Hesap kimliğini yalnız yerel notunuzda tutun; token, anahtar ve parola göndermeyin.
3. Alan adı satın almak veya DNS değiştirmek bu aşamada gerekli değil. Create application / Import repository işlemini başlatmayın: Git entegrasyonu otomatik build/deployment tetikleyebilir. GitHub App veya Cloudflare deploy token oluşturmayın.
4. Yerel kabul: repo kökünde Node 22, pnpm 10.18.3, frozen install ve pilot-demo.mjs --out yeni-dizin. operations.html ve JSON'da üç başarılı ajan, iki onay, bir revision ve HARD NO-GO görünmelidir. Artifact 15008478452, exact SHA 99d6d1ac998307bd73227fe48a591f97bc11605c, SHA256 f32391c364b3f85411e92e987e2e33fab8589c934868fe2a4981417481f6d582.

## Sonraki aşamalar — yalnız yeni açık kullanıcı yetkisi ve ilgili kabul kapıları sonrasında
- Ayrı Cloudflare pilot kaynakları, bağımsız erişim yetkileri, ayrı boş D1; gerçek ID sentetik config'e yazılmaz. TPW_DB binding, TPW_AGENT_WORKFLOW binding; release CLOSED, GitHub writes DISABLED, cron yok. Uzak D1/Worker yaratma, migration ve deploy şu an yasak.
- Secret değerleri Cloudflare Secrets üzerinden tutulur; vars, public GitHub, artifact veya sohbet içine değer yazılmaz. TPW_EDITOR_API_TOKEN ve GITHUB_APP_PRIVATE_KEY secret; doğrulama public key'leri ayrıdır.
- GitHub hedefi yalnız ayrı private ftmstr/TopWhiz-Content-Private / content-approved-pilot; gerçek repo doğrulanmadan App kurulmaz. Public build repo içerik hedefi değildir.
- Cron yalnız izin sonrası :00 TPW1, :20 TPW3, :40 TPW2. Mevcut ChatGPT otomasyonlarıyla çift çalıştırma engeli gerekir.

## TPW2 editor transport v1 (local contract)
POST fixed allowlisted canonical HTTPS URL; bearer scoped to editor; application/json request and 200 application/json response; redirects denied; 64 KiB response limit, 20-second deadline. Candidate contains whitelisted metadata only. News request {schemaVersion,candidate}, response approved article. Device request additionally previousRevision, slot, authorityEpoch; response exactly {article,proof}, epoch equality, article lineage and TR/EN policy. Device proof is independently verified by existing revision ledger (Ed25519, distinct issuer/admin, canonical serialization, CAS). Future private news writes also require existing pinned P-256 editorial proof. A model output or proof of key possession alone is not fact/licensing proof.
Current editor-client refuses PRIVATE_PILOT and any non-reserved endpoint; only an injected synthetic transport is allowed. This is a preparatory contract, NOT an actual editor service. Production requires reviewed service identity, bounded authenticated transport, model provider contract, independent factual and legal review, key custody, explicit denial contract, costs/quotas and network cancellation testing. No real provider/API token provisioned. The current 20s deadline bounds the caller; a non-cooperative transport may continue internally, so actual cancellation requires integration evidence. No automatic retries.

## Release order (all open)
P0: Issue #22 R2 final-check-to-byte revocation race / realistic CDN invalidation, IAM, rights and external review. Retain negative proof, no bypass.
P0: approved source connectors, independent license and real editor authority, remote D1/IAM and private repository verification.
P0: brand/media/license rights and Dragon Point calibration, physical Safari/Android acceptance.
P1: actual isolated private pilot after user approval, separate deploy approval and exact CI evidence.
P1: site domain, DNS, public route and monitored release only after all hard gates.
No main merge, remote deploy, real source, real publication or new automation in this round.

Official references (checked 2026-11-25):
https://developers.cloudflare.com/workers/ci-cd/builds/
https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
https://developers.cloudflare.com/d1/get-started/
https://developers.cloudflare.com/workers/configuration/secrets/
https://developers.cloudflare.com/workers/configuration/cron-triggers/
