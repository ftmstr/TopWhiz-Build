/**
 * Explicit site ad real-estate, preview only.
 * No AdSense publisher ID, scripts, overlays, auto-clicks or live ads.
 * Live activation requires approved AdSense site, consent policy and
 * exact Google-supplied ad-unit code after security review.
 */
export type AdPlacement = "top" | "right" | "bottom";
const PLACEMENTS: Record<AdPlacement, {label: string; hint: string}> = {
  top: { label: "Üst reklam alanı", hint: "Yatay · reklam yerleşimi önizlemesi" },
  right: { label: "Sağ reklam alanı", hint: "Masaüstü dikey · reklam yerleşimi önizlemesi" },
  bottom: { label: "Alt reklam alanı", hint: "Yatay · reklam yerleşimi önizlemesi" }
};
export function AdSlot({ placement }: { placement: AdPlacement }) {
  const config = PLACEMENTS[placement];
  return <div className={"topwhiz-ad-slot ad-" + placement} data-ad-placement={placement} role="note"
    aria-label={config.label + " (aktif reklam yok)"}>
    <span className="ad-slot-label">REKLAM ALANI · ÖNİZLEME</span>
    <span className="ad-slot-hint">{config.hint}</span>
  </div>;
}
