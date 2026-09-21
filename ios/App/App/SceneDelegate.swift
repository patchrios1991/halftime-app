import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // UIKit builds `window` from the Main storyboard automatically (see
        // UISceneStoryboardFile in Info.plist) as long as we don't create one
        // ourselves here — same root view controller (CAPBridgeViewController)
        // as the pre-scene lifecycle used.
        guard (scene as? UIWindowScene) != nil else { return }

        // Cold launch via custom URL scheme (e.g. tapping the OAuth deep link
        // while the app wasn't already running).
        if let context = connectionOptions.urlContexts.first {
            forwardOpenURL(context)
        }

        // Cold launch via universal link.
        if let userActivity = connectionOptions.userActivities.first {
            forwardUserActivity(userActivity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Warm launch / foreground return via custom URL scheme — this is the
        // path com.halftimeapp.app://auth-callback normally takes.
        guard let context = URLContexts.first else { return }
        forwardOpenURL(context)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        forwardUserActivity(userActivity)
    }

    private func forwardOpenURL(_ context: UIOpenURLContext) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: context.url,
            options: [
                .sourceApplication: context.options.sourceApplication as Any,
                .annotation: context.options.annotation as Any,
                .openInPlace: context.options.openInPlace
            ]
        )
    }

    private func forwardUserActivity(_ userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
