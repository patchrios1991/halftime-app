// ─── useAuth ──────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  signIn as apiSignIn,
  signUp as apiSignUp,
  signOut as apiSignOut,
  signInWithGoogle as apiSignInWithGoogle,
  signInWithApple as apiSignInWithApple,
  signInWithMagicLink as apiSignInWithMagicLink,
  getProfile,
  updateProfile as apiUpdateProfile,
} from "../api/auth";

/**
 * Central auth hook — subscribe to session changes, expose helpers.
 *
 * Usage:
 *   const { user, profile, loading, signIn, signOut, updateProfile } = useAuth();
 *
 * In offline/demo mode (no Supabase creds) the hook returns a synthetic
 * demo user so every screen still renders.
 */
export function useAuth() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ── Load profile helper ────────────────────────────────────────────────────
  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) { setProfile(null); return; }
    try {
      let p = await getProfile();
      setProfile(p);

      // Claim a pending referral code left by a /r/:code visit (migration 050),
      // if this user hasn't already been attributed to a referrer. Runs on
      // every profile load, not just right after signup, so it works
      // regardless of auth method or an email-confirmation gap in between.
      let pendingCode = null;
      try { pendingCode = localStorage.getItem("ht_referral_code"); } catch { /* ignore */ }
      if (pendingCode && p && !p.referred_by) {
        try {
          await supabase.rpc("claim_referral", { p_code: pendingCode });
          p = await getProfile();
          setProfile(p);
        } catch (e) {
          console.warn("useAuth: referral claim failed", e.message);
        }
      }
      if (pendingCode) {
        try { localStorage.removeItem("ht_referral_code"); } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn("useAuth: could not load profile", e.message);
    }
  }, []);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Demo mode — synthetic user so screens don't need null-checks
      setUser({ id: "demo", email: "demo@halftime.app" });
      setProfile({
        id:              "demo",
        display_name:    "Demo User",
        avatar_initials: "DU",
        trust_score:     85,
        verified:        true,
      });
      setLoading(false);
      return;
    }

    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null).finally(() => setLoading(false));
    });

    // Subscribe to future changes (sign-in / sign-out / token refresh)
    //
    // This callback runs while GoTrueClient still holds its internal
    // per-session lock (it's invoked from inside setSession()/etc.'s
    // _notifyAllSubscribers(), before that call is allowed to return).
    // loadProfile() -> getProfile() calls supabase.auth.getUser(), which
    // needs that same lock — awaiting it directly here deadlocks: setSession()
    // waits on this callback, this callback waits on getUser(), and getUser()
    // waits on a lock setSession() is still holding. Confirmed on-device via
    // gotrue-js's own debug logging: setSession() during the native Sign in
    // with Apple/Google flow hung forever with "_notifyAllSubscribers(SIGNED_IN)
    // begin" logged and no matching "end". Deferring with setTimeout lets the
    // current call stack (and the lock) unwind first — this is Supabase's own
    // documented guidance for onAuthStateChange callbacks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setTimeout(() => { loadProfile(session?.user ?? null); }, 0);
      }
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  // ── Auth actions ───────────────────────────────────────────────────────────
  const signIn = useCallback(async (credentials) => {
    setError(null);
    try {
      return await apiSignIn(credentials);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signUp = useCallback(async (credentials) => {
    setError(null);
    try {
      return await apiSignUp(credentials);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await apiSignOut();
      setUser(null);
      setProfile(null);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      return await apiSignInWithGoogle();
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    setError(null);
    try {
      return await apiSignInWithApple();
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const signInWithMagicLink = useCallback(async (email) => {
    setError(null);
    try {
      return await apiSignInWithMagicLink(email);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const updateProfile = useCallback(async (updates) => {
    setError(null);
    try {
      const updated = await apiUpdateProfile(updates);
      setProfile(updated);
      return updated;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  return {
    user,
    profile,
    loading,
    error,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    signInWithApple,
    signInWithMagicLink,
    updateProfile,
  };
}
