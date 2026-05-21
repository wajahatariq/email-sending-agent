'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Campaigns' },
  { href: '/domains', label: 'Domains' },
  { href: '/templates', label: 'Templates' },
  { href: '/upload', label: 'Upload' },
  { href: '/log', label: 'Send Log' },
  { href: '/replies', label: 'Replies' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <span className="nav-eyebrow">Workspace</span>
      {LINKS.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={active ? 'nav-link is-active' : 'nav-link'}
            aria-current={active ? 'page' : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
