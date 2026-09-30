// ─── Router bridge ────────────────────────────────────────────────────────────
// Lets code outside React components (native.js's deep-link handler) trigger a
// real React Router navigation. BrowserRouter keeps its own internal location
// state; calling window.history.pushState() directly — even with a synthetic
// "popstate" event dispatched afterward — does not reliably update that internal
// state, so the router keeps rendering whatever route was mounted (e.g. SignIn
// stuck showing its "Please wait…" busy state) even though the URL bar changed.
// A small bridge component (rendered once inside <BrowserRouter>) hands its
// useNavigate() function to this module so it can be called from anywhere.
let navigateFn = null;

export function setNavigateFn(fn) {
  console.log("[HalfTime][debug] routerBridge: navigate function captured");
  navigateFn = fn;
}

export function navigateApp(path, options) {
  console.log("[HalfTime][debug] navigateApp called:", path, "navigateFn set?", !!navigateFn);
  if (navigateFn) {
    navigateFn(path, options);
    console.log("[HalfTime][debug] navigateFn(path) called");
  } else {
    // Router hasn't mounted yet (shouldn't happen in practice — this is only
    // called from the deep-link handler after the app is already running).
    console.log("[HalfTime][debug] navigateFn was null, falling back to location.assign");
    window.location.assign(path);
  }
}
