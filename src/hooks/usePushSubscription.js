// ─── usePushSubscription ──────────────────────────────────────────────────────
// Push notifications, branched by platform:
//   - Web (browser): Web Push API (service worker + PushManager + VAPID).
//   - Native (iOS/Android): Firebase Cloud Messaging, via
//     @capacitor-firebase/messaging. FCM bridges to APNs on iOS and talks to
//     FCM directly on Android, so one token type covers both.
// Capacitor's embedded WKWebView does not support the Web Push API, so the
// native app needs this separate path — confirmed on-device (no Notifications
// entry ever appeared in iOS Settings, since iOS only creates that entry once
// an app registers through APNs, which the old Web-Push-only code never did).
import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { isNative } from "../lib/native";

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

  // ── Native (FCM) ─────────────────────────────────────────────────────────
  async function checkNativeStatus() {
    if (!isSupabaseConfigured) { setSupported(false); return; }
    try {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
      setSupported(true);
      const perm = await FirebaseMessaging.checkPermissions();
      setPermission(perm.receive === "granted" ? "granted"
        : perm.receive === "denied" ? "denied" : "default");
      setSubscribed(perm.receive === "granted");
    } catch {
      // Plugin not available (e.g. native build without GoogleService-Info.plist
      // / google-services.json configured yet) — hide the push UI rather than
      // show a broken control.
      setSupported(false);
    }
  }

  async function subscribeNative() {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const permResult = await FirebaseMessaging.requestPermissions();
    const granted = permResult.receive === "granted";
    setPermission(granted ? "granted" : "denied");
    if (!granted) throw new Error("Notification permission denied");

    const { token } = await FirebaseMessaging.getToken();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const platform = Capacitor.getPlatform(); // "ios" | "android"
    const { error: dbErr } = await supabase
      .from("device_push_tokens")
      .upsert({ user_id: user.id, token, platform }, { onConflict: "token" });
    if (dbErr) throw dbErr;

    setSubscribed(true);
  }

  async function unsubscribeNative() {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const { token } = await FirebaseMessaging.getToken();
    await FirebaseMessaging.deleteToken();
    if (isSupabaseConfigured) {
      await supabase.from("device_push_tokens").delete().eq("token", token);
    }
    setSubscribed(false);
  }

  // ── Web (Web Push) ───────────────────────────────────────────────────────
  async function checkExistingWebSubscription() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      }
    } catch { /* ignore */ }
  }

  async function subscribeWeb() {
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
      .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });
    if (dbErr) throw dbErr;

    setSubscribed(true);
  }

  async function unsubscribeWeb() {
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
  }

  useEffect(() => {
    if (isNative) {
      checkNativeStatus();
    } else {
      const ok =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        !!VAPID_PUBLIC_KEY &&
        isSupabaseConfigured;
      setSupported(ok);
      if ("Notification" in window) setPermission(Notification.permission);
      if (ok) checkExistingWebSubscription();
    }
  }, []);

  // ── Shared entry points ──────────────────────────────────────────────────
  async function subscribe() {
    setLoading(true);
    setError(null);
    try {
      if (isNative) await subscribeNative();
      else await subscribeWeb();
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
      if (isNative) await unsubscribeNative();
      else await unsubscribeWeb();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
