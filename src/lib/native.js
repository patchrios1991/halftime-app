// ─── Native (Capacitor) helpers ──────────────────────────────────────────────
// Google blocks OAuth inside WebViews, so on native the OAuth URL opens in the
// system browser and Supabase redirects back into the app via the custom
// scheme below. initNativeDeepLinks() catches that redirect, restores the
// session from the URL fragment (implicit flow), and reloads into the app.
//
// Email links (signup confirmation, magic link) can't use the custom scheme —
// mail clients won't treat an arbitrary custom-scheme link as tappable/safe,
// so authRedirectUrl() points those at the hosted web app instead
// (https://app.halftime-app.com/auth/callback). On native, that URL is also
// registered as a Universal Link (see public/.well-known/apple-app-site-
// association + the "Associated Domains" capability in Xcode), so tapping it
// opens this app directly via this same appUrlOpen listener instead of
// Safari — the AUTH_CALLBACK_PATH check below handles that case too.
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { navigateApp } from "./routerBridge";

export const isNative = Capacitor.isNativePlatform();

// Custom scheme registered in AndroidManifest.xml and ios Info.plist
export const AUTH_DEEP_LINK = "com.halftimeapp.app://auth-callback";

// Path segment shared by both the custom-scheme deep link above and the
// Universal Link (https://app.halftime-app.com/auth/callback) — either one
// carries the token fragment and needs the same handling.
const AUTH_CALLBACK_PATH = "/auth/callback";

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
 *   com.halftimeapp.app://auth-callback#access_token=…      → restore session
 *   https://app.halftime-app.com/auth/callback#access_token=… (Universal Link,
 *     e.g. from tapping a signup-confirmation email)          → restore session
 *   https://app.halftime-app.com/<other path>                 → route into the app
 */
export async function initNativeDeepLinks() {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");

  App.addListener("appUrlOpen", async ({ url }) => {
    try {
      if (url.startsWith(AUTH_DEEP_LINK) || url.includes(AUTH_CALLBACK_PATH)) {
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
          navigateTo("/app");
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
