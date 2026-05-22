import { Nav } from './Nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Brand is operator-configured via the COMPANY_NAME env var — no brand is
  // hardcoded. One deployment serves one brand; change COMPANY_NAME to rebrand.
  const brand = process.env.COMPANY_NAME?.trim() || '';
  const mark = (brand.charAt(0) || 'S').toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark">{mark}</span>
          <span>Sending Agent</span>
        </div>
        <Nav />
        {brand ? <div className="sidebar-foot">{brand}</div> : null}
      </aside>
      <main className="content">
        <div className="content-inner">{children}</div>
      </main>
    </div>
  );
}
