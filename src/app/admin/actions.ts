'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  adminConfigured,
  checkCredentials,
  currentAdmin,
  endSession,
  recordFailedAttempt,
  startSession,
  tooManyAttempts,
} from '@/server/auth';
import { LEAD_STATUSES, updateLeadStatus, type LeadStatus } from '@/server/db';

export async function login(formData: FormData): Promise<void> {
  if (!adminConfigured()) redirect('/admin?error=config');
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'local';
  const key = `login:${ip}`;
  if (tooManyAttempts(key)) redirect('/admin?error=limite');

  const user = String(formData.get('user') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!checkCredentials(user, password)) {
    recordFailedAttempt(key);
    redirect('/admin?error=credenciales');
  }
  await startSession(user.trim().toLowerCase());
  redirect('/admin');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/admin');
}

export async function setLeadStatus(formData: FormData): Promise<void> {
  if (!(await currentAdmin())) redirect('/admin');
  const id = Number(formData.get('id'));
  const status = String(formData.get('status') ?? '');
  if (!Number.isInteger(id) || id <= 0 || !(LEAD_STATUSES as readonly string[]).includes(status)) return;
  updateLeadStatus(id, status as LeadStatus);
  revalidatePath('/admin');
}
