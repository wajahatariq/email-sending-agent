'use server';
import { revalidatePath } from 'next/cache';
import { setSelectedBrandCookie } from '@/lib/brand';

export async function switchBrandAction(formData: FormData) {
  await setSelectedBrandCookie(Number(formData.get('id')));
  revalidatePath('/', 'layout');
}
