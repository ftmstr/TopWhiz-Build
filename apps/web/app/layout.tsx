import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOPWHIZ | Teknolojiyi karşılaştır, daha bilinçli seç",
  description: "TOPWHIZ tasarım önizlemesi: kaynaklı cihaz bilgileri, şeffaf karşılaştırmalar ve teknoloji rehberleri için hazırlanan platform.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
