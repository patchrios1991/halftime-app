// ─── useAuth ──────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  signIn as apiSignIn,
  signUp as apiSignUp,
  signOut as apiSignOut,
  signInWithGoogle as apiSignInWithGoogle,
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
      const p = await getProfile();
      setProfile(p);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
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
    signInWithMagicLink,
    updateProfile,
  };
}
