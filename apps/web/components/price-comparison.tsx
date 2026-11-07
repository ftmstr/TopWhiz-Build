"use client";

import { useMemo, useState } from "react";
import demoCatalog from "../data/demo-catalog.json";
import demoPriceOffers from "../data/demo-price-offers.json";

type Offer = {
  id: string;
  deviceId: string;
  variant: string;
  merchant: string;
  price: number;
  shipping: number | null;
  currency: "TRY";
  observedAt: string;
  market: "TR";
  stock: "available" | "out-of-stock" | "unknown";
  recordState: "demo" | "published";
  purchaseUrl: string | null;
  affiliate: boolean;
};

const offers: Offer[] = demoPriceOffers.map((offer) => ({ ...offer, currency: "TRY", market: "TR", stock: "available", recordState: "demo" }));

function verifiedLink(offer: Offer): string | null {
  if (offer.recordState !== "published" || !offer.purchaseUrl) return null;
  try {
    const url = new URL(offer.purchaseUrl);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password ||
        !hostname.includes(".") || hostname === "localhost" ||
        hostname.endsWith(".local") || hostname.endsWith(".localhost")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function displayMoney(amount: number, currency: Offer["currency"]) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
}

function observedDate(isoDate: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" })
    .format(new Date(isoDate));
}

export function PriceComparison({ selectedDeviceId, onDeviceChange }: {
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"total" | "merchant">("total");
  const selected = demoCatalog.find((device) => device.id === selectedDeviceId);
  const rows = useMemo(() => offers
    .filter((offer) => offer.deviceId === selectedDeviceId)
    .sort((left, right) => sortBy === "merchant"
      ? left.merchant.localeCompare(right.merchant, "tr")
      : (left.price + (left.shipping ?? Infinity)) - (right.price + (right.shipping ?? Infinity))),
  [selectedDeviceId, sortBy]);

  return (
    <section className="section container" id="prices" aria-labelledby="prices-title">
      <div className="section-top">
        <div>
          <span className="section-kicker">MAĞAZA BAZLI KARŞILAŞTIRMA</span>
          <h2 id="prices-title">Fiyatları gör. <span>Avantajlı seç.</span></h2>
          <p>Ürün, satıcı, kargo, tarih ve bağlantı bilgilerini karşılaştırmaya hazırlanan arayüz.</p>
        </div>
        <span className="section-stamp">TUR 003 · ÖRNEK VERİ</span>
      </div>
      <div className="prices-demo-notice" role="note">
        <strong>Yalnızca tasarım demosu:</strong> Cihaz ve mağaza isimleri ile bütün fiyatlar kurgusaldır.
        Gerçek teklif, canlı fiyat, indirim veya mağaza bağlantısı bulunmaz.
      </div>
      <div className="prices-shell">
        <div className="prices-controls">
          <label>ÖRNEK CİHAZ
            <select value={selectedDeviceId} onChange={(event) => onDeviceChange(event.target.value)}>
              {demoCatalog.map((device) =>
                <option value={device.id} key={device.id}>{device.name} · {device.specs.storage}</option>)}
            </select>
          </label>
          <label>SIRALAMA
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "total" | "merchant")}>
              <option value="total">Toplam fiyata göre (artan)</option>
              <option value="merchant">Mağaza adına göre (A-Z)</option>
            </select>
          </label>
        </div>
        <div className="prices-caption" aria-live="polite">
          {selected?.name} · {rows.length} kurgu teklif · TR / TRY
        </div>
        {rows.length ? (
          <div className="prices-offers">
            {rows.map((offer, index) => {
              const link = verifiedLink(offer);
              const total = offer.price + (offer.shipping ?? 0);
              return (
                <article className="prices-offer" key={offer.id}>
                  <div className="prices-merchant">
                    <strong>{offer.merchant}</strong>
                    <span>{offer.variant} · {offer.stock === "available" ? "Örnek stokta" : "Stok belirsiz"} · {observedDate(offer.observedAt)}</span>
                  </div>
                  <div className="prices-amount">
                    <strong>{displayMoney(total, offer.currency)}</strong>
                    <span>{displayMoney(offer.price, offer.currency)} + {offer.shipping === 0 ? "ücretsiz kargo" : displayMoney(offer.shipping ?? 0, offer.currency) + " kargo"}</span>
                  </div>
                  <div className="prices-action">
                    {index === 0 && sortBy === "total" && <span className="prices-best">En düşük örnek toplam</span>}
                    {link ? <a href={link} target="_blank" rel={offer.affiliate ? "noopener noreferrer sponsored" : "noopener noreferrer"}>Satıcıya git ↗</a> :
                      <span className="prices-link-disabled" aria-label="Bu demo teklifi için satıcı bağlantısı yok">Demo · bağlantı yok</span>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="prices-empty">Bu örnek cihaz için fiyat kaydı yok. Canlı sistemde doğrulanmamış fiyatlar yayımlanmayacak.</div>
        )}
      </div>
      <p className="compare-disclaimer">
        Sıralama ilkesi: <strong>ürün satış fiyatı + zorunlu kargo</strong> (biliniyorsa), küçükten büyüğe.
        Koşullu kuponlar, taksit avantajları ve üyelik fiyatları ayrı açıklanacak. Ticari anlaşmalar organik sıralamayı değiştirmeyecek.
        Gerçek yayında satıcı kaynağı, son kontrol tarihi, ürün varyantı ve reklam/ortaklık açıklaması zorunlu olacak.
      </p>
    </section>
  );
}
