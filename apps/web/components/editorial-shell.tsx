import Link from "next/link";
import { AdSlot } from "./ad-slots";

export function EditorialShell({children}:{children:React.ReactNode}){
  return <>
    <header className="site-header">
      <div className="container header-inner">
        <Link className="logo-lockup" href="/" aria-label="TOPWHIZ ana sayfa">
          <span className="logo-word">TOP<span>WHIZ</span></span>
        </Link>
        <nav className="nav-links" aria-label="Ana menü">
          <Link href="/haberler">Haberler</Link>
          <Link href="/telefonlar">Telefonlar</Link>
          <Link href="/#prices">Fiyatlar</Link>
        </nav>
      </div>
    </header>
    <AdSlot placement="top"/>
    <div className="topwhiz-with-rail">
      <main className="topwhiz-main">{children}</main>
      <aside className="topwhiz-rail" aria-label="Sağ reklam yerleşimi"><AdSlot placement="right"/></aside>
    </div>
    <AdSlot placement="bottom"/>
    <footer className="site-footer"><div className="container footer-inner"><span className="footer-brand">TOP<span>WHIZ</span></span><small>Hakları doğrulanmış yayınlar, şeffaf kaynaklar.</small></div></footer>
  </>;
}
