import { Nav } from './Nav';
import { BrandSwitcher } from './BrandSwitcher';
import { listBrands, getSelectedBrandId } from '@/lib/brand';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brands = await listBrands();
  const selectedId = await getSelectedBrandId();
  const brandList = brands.map(b => ({ id: b.id, name: b.name }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark">S</span>
          <span>Sending Agent</span>
        </div>
        <Nav />
        <BrandSwitcher brands={brandList} selectedId={selectedId} />
      </aside>
      <main className="content">
        <div className="content-inner">{children}</div>
      </main>
    </div>
  );
}
