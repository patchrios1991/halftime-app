// ─── Auth API ─────────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { isNative, AUTH_DEEP_LINK, authRedirectUrl, openInSystemBrowser } from "../lib/native";

/** Sign up with email + password */
export async function signUp({ email, password, displayName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: authRedirectUrl(),
    },
  });
  if (error) throw error;
  return data;
}

/** Sign in with email + password */
export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Magic link (passwordless) — sends email */
export async function signInWithMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

/** Sign in with Google OAuth */
export async function signInWithGoogle() {
  if (isNative) {
    // Google blocks OAuth in WebViews — open the system browser and come
    // back via the deep link (handled in lib/native.js).
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: AUTH_DEEP_LINK, skipBrowserRedirect: true },
    });
    if (error) throw error;
    await openInSystemBrowser(data.url);
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

/** Sign out */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Get the current session */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/** Get the current user's profile */
export async function getProfile() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
}

/** Update the current user's profile */
export async function updateProfile(updates) {
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Get notifications for the current user */
export async function getNotifications() {
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data;
}

/** Mark all notifications read */
export async function markAllNotifsRead() {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) throw error;
}
