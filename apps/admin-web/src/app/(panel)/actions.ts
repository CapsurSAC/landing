'use server';

import { redirect } from 'next/navigation';
import { endSession, getCurrentUser } from '@/lib/server/auth';
import { audit } from '@/lib/server/log';

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await endSession();
  if (user) audit('admin.logout', user.email);
  redirect('/login');
}
