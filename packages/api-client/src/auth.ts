import { supabase } from "./supabase";

export async function signUp(input: { email: string; password: string; full_name?: string; phone?: string }) {
  const { data, error } = await supabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name, phone: input.phone } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(input: { email: string; password: string }) {
  const { data, error } = await supabase().auth.signInWithPassword(input);
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase().auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase().auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (event: string, session: any) => void) {
  const { data } = supabase().auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}
