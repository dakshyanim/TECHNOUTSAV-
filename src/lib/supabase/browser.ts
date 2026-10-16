'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

let client: SupabaseClient | undefined;

export function getBrowserSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase configuration is missing or invalid.');
  client ??= createClient(config.url, config.key);
  return client;
}
