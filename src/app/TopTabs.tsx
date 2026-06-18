'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Top-level tabs switching between the two apps in this single deployment.
// Email Sender owns the dashboard routes; Lead Generation lives under /leads.
export function TopTabs() {
  const pathname = usePathname();
  const onLeads = pathname.startsWith('/leads');
  return (
    <div className="topbar">
      <span className="topbar-brand">Outreach Suite</span>
      <nav className="topbar-tabs">
        <Link href="/" className={onLeads ? 'topbar-tab' : 'topbar-tab is-active'}>
          Email Sender
        </Link>
        <Link href="/leads" className={onLeads ? 'topbar-tab is-active' : 'topbar-tab'}>
          Lead Generation
        </Link>
      </nav>
    </div>
  );
}
