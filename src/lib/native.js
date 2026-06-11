// ─── Native (Capacitor) helpers ──────────────────────────────────────────────
// Google blocks OAuth inside WebViews, so on native the OAuth URL opens in the
// system browser and Supabase redirects back into the app via the custom
// scheme below. initNativeDeepLinks() catches that redirect, restores the
// session from the URL fragment (implicit flow), and reloads into the app.
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

export const isNative = Capacitor.isNativePlatform();

// Custom scheme registered in AndroidManifest.xml and ios Info.plist
export const AUTH_DEEP_LINK = "com.halftimeapp.app://auth-callback";

// Where Supabase email links (magic link / confirmation) should land.
// window.location.origin is https://localhost inside Capacitor, so emails
// must always point at the hosted web app.
export function authRedirectUrl() {
  return isNative
    ? "https://app.halftime-app.com/auth/callback"
    : `${window.location.origin}/auth/callback`;
}

/** Open a URL in the system browser (Custom Tab / SFSafariViewController). */
export async function openInSystemBrowser(url) {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}

/**
 * Register the appUrlOpen listener. Call once at startup (no-op on web).
 * Handles:
 *   com.halftimeapp.app://auth-callback#access_token=…  → restore session
 *   https://app.halftime-app.com/<path>                 → route into the app
 */
export async function initNativeDeepLinks() {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");

  App.addListener("appUrlOpen", async ({ url }) => {
    try {
      if (url.startsWith(AUTH_DEEP_LINK)) {
        // Close the in-app browser tab if the platform supports it
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch { /* not implemented on Android — Custom Tab dismisses itself */ }

        const fragment = new URLSearchParams(url.split("#")[1] ?? "");
        const access_token  = fragment.get("access_token");
        const refresh_token = fragment.get("refresh_token");
        const errorDesc     = fragment.get("error_description");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          window.location.assign("/app");
        } else if (errorDesc) {
          console.error("[HalfTime] OAuth error:", errorDesc);
          window.location.assign("/auth/signin");
        }
        return;
      }

      // Future App Links (https://app.halftime-app.com/join/…, /guest/…)
      const appLink = url.match(/^https:\/\/app\.halftime-app\.com(\/.*)?$/);
      if (appLink) window.location.assign(appLink[1] || "/");
    } catch (err) {
      console.error("[HalfTime] deep link handling failed:", err);
    }
  });
}
