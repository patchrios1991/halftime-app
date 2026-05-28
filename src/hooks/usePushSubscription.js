// ─── usePushSubscription ──────────────────────────────────────────────────────
// Handles web push subscription: registers service worker, requests permission,
// saves subscription to Supabase, and provides subscribe/unsubscribe controls.
import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const [supported,  setSupported]  = useState(false);
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!VAPID_PUBLIC_KEY &&
      isSupabaseConfigured;
    setSupported(ok);
    if ("Notification" in window) setPermission(Notification.permission);
    if (ok) checkExistingSubscription();
  }, []);

  async function checkExistingSubscription() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      }
    } catch {}
  }

  async function subscribe() {
    setLoading(true);
    setError(null);
    try {
      // Register SW if not already registered
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") throw new Error("Notification permission denied");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON();
      const endpoint = subJson.endpoint;
      const p256dh   = subJson.keys?.p256dh;
      const auth     = subJson.keys?.auth;

      if (!p256dh || !auth) throw new Error("Push subscription keys missing");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: dbErr } = await supabase
        .from("push_subscriptions")
        .upsert(
          { user_id: user.id, endpoint, p256dh, auth },
          { onConflict: "endpoint" }
        );
      if (dbErr) throw dbErr;

      setSubscribed(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.toJSON().endpoint;
          await sub.unsubscribe();
          if (isSupabaseConfigured) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
          }
        }
      }
      setSubscribed(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
