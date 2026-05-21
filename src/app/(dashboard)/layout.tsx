import { Nav } from './Nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark">A</span>
          <span>Sending Agent</span>
        </div>
        <Nav />
        <div className="sidebar-foot">Austro Web n Logo</div>
      </aside>
      <main className="content">
        <div className="content-inner">{children}</div>
      </main>
    </div>
  );
}
