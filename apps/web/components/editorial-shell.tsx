import Link from "next/link";
import Image from "next/image";
import { AdSlot } from "./ad-slots";

export function EditorialShell({children}:{children:React.ReactNode}){
  return <>
    <a className="skip-link" href="#main">İçeriğe geç</a>
    <header className="site-header">
      <div className="container header-inner">
        <Link className="logo-lockup" href="/" aria-label="TOPWHIZ ana sayfa">
          <span className="logo-thumb"><Image src="/brand/TopWhiz_Logo_02_KirmiziSariMavi.png" alt="" width={52} height={52}/></span>
          <span className="logo-word">TOP<span>WHIZ</span></span>
        </Link>
        <nav className="nav-links editorial-nav" aria-label="Ana menü">
          <Link href="/haberler">Haberler</Link>
          <Link href="/telefonlar">Telefonlar</Link>
          <Link href="/dragon-point">Dragon Point</Link>
          <Link href="/#prices">Fiyatlar</Link>
        </nav>
      </div>
    </header>
    <AdSlot placement="top"/>
    <div className="topwhiz-with-rail">
      <main id="main" tabIndex={-1} className="topwhiz-main">{children}</main>
      <aside className="topwhiz-rail" aria-label="Sağ reklam yerleşimi"><AdSlot placement="right"/></aside>
    </div>
    <AdSlot placement="bottom"/>
    <footer className="site-footer"><div className="container footer-inner"><span className="footer-brand">TOP<span>WHIZ</span></span><small>Hakları doğrulanmış yayınlar, şeffaf kaynaklar.</small></div></footer>
  </>;
}
