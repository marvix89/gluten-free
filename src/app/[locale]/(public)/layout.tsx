import Link from 'next/link';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="header-logo">
            <div className="header-logo-icon">🌾</div>
            <span className="header-logo-text">Gluten Free</span>
            <span className="header-badge">Legal</span>
          </Link>
          <div className="top-nav">
            <Link href="/" className="nav-btn">
              Torna all'App
            </Link>
          </div>
        </div>
      </header>
      <main className="main-content legal-content">
        <div className="legal-container">
          {children}
        </div>
      </main>
    </div>
  );
}
