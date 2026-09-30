// ─── Native (Capacitor) helpers ──────────────────────────────────────────────
// Google blocks OAuth inside WebViews, so on native the OAuth URL opens in the
// system browser and Supabase redirects back into the app via the custom
// scheme below. initNativeDeepLinks() catches that redirect, restores the
// session from the URL fragment (implicit flow), and reloads into the app.
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { navigateApp } from "./routerBridge";

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
 * Navigate within the already-running app, without a full page reload.
 * A full reload (window.location.assign) tears down and reboots the whole
 * WebView — re-running Supabase client init, session restore, and listener
 * registration from scratch. If any of that hangs (flaky network right
 * after an OAuth round trip, a backgrounded WebView, etc.) the app is
 * stranded on a loading screen until force-restarted.
 *
 * A manual window.history.pushState() + synthetic "popstate" event does NOT
 * reliably update BrowserRouter's internal location state — it keeps its own
 * history object and reconciles popstate events against entries it created
 * itself, so an event dispatched from outside React can be silently ignored.
 * That's why this previously still left the sign-in screen mounted (visibly
 * stuck on "Please wait…") even though the URL bar had changed underneath it.
 * routerBridge.navigateApp() calls the router's own useNavigate() function
 * instead, so it actually is a router-driven transition.
 */
function navigateTo(path) {
  navigateApp(path, { replace: true });
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

  console.log("[HalfTime][debug] initNativeDeepLinks: listener registered");

  App.addListener("appUrlOpen", async ({ url }) => {
    console.log("[HalfTime][debug] appUrlOpen fired:", url);
    try {
      if (url.startsWith(AUTH_DEEP_LINK)) {
        console.log("[HalfTime][debug] matches AUTH_DEEP_LINK");
        // Close the in-app browser tab if the platform supports it
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
          console.log("[HalfTime][debug] Browser.close() resolved");
        } catch (e) {
          console.log("[HalfTime][debug] Browser.close() threw (expected on Android):", e);
        }

        const fragment = new URLSearchParams(url.split("#")[1] ?? "");
        const access_token  = fragment.get("access_token");
        const refresh_token = fragment.get("refresh_token");
        const errorDesc     = fragment.get("error_description");
        console.log("[HalfTime][debug] tokens present:", { hasAccess: !!access_token, hasRefresh: !!refresh_token, errorDesc });

        if (access_token && refresh_token) {
          console.log("[HalfTime][debug] calling supabase.auth.setSession...");
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) { console.log("[HalfTime][debug] setSession errored:", error); throw error; }
          console.log("[HalfTime][debug] setSession succeeded, calling navigateTo('/app')");
          navigateTo("/app");
          console.log("[HalfTime][debug] navigateTo('/app') call returned, location is now:", window.location.pathname);
        } else if (errorDesc) {
          console.error("[HalfTime] OAuth error:", errorDesc);
          navigateTo("/auth/signin");
        }
        return;
      }

      // Future App Links (https://app.halftime-app.com/join/…, /guest/…)
      const appLink = url.match(/^https:\/\/app\.halftime-app\.com(\/.*)?$/);
      if (appLink) navigateTo(appLink[1] || "/");
    } catch (err) {
      console.error("[HalfTime] deep link handling failed:", err);
    }
  });
}
