'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { switchBrandAction } from './brand-actions';

interface Props {
  brands: { id: number; name: string }[];
  selectedId: number | null;
}

export function BrandSwitcher({ brands, selectedId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  if (brands.length === 0) {
    return (
      <div className="sidebar-foot">
        <span className="hint">
          No brands —{' '}
          <Link href="/brands">add one</Link>
        </span>
      </div>
    );
  }

  return (
    <div className="sidebar-foot">
      <form ref={formRef} action={switchBrandAction}>
        <select
          className="select"
          name="id"
          defaultValue={selectedId ?? brands[0].id}
          onChange={() => formRef.current?.requestSubmit()}
        >
          {brands.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}
