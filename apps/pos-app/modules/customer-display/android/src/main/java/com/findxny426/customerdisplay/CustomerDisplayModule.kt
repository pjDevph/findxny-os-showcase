package com.findxny426.customerdisplay

import android.app.Presentation
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.ViewGroup
import android.widget.FrameLayout

import com.facebook.react.ReactApplication
import com.facebook.react.interfaces.fabric.ReactSurface

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Drives the customer-facing screen on a secondary ("presentation") display —
 * e.g. the iMin Swan 2 Pro's built-in second screen.
 *
 * It mounts a React surface running the JS-registered "CustomerDisplay"
 * component. Because that surface shares the app's JS runtime, it stays in
 * sync with the cashier screen through the shared module store — no bridge
 * messaging required for the live order data.
 *
 * A DisplayManager.DisplayListener drives `show()` automatically on
 * hotplug/reconnect. Previously `setEnabled(true)` only ever fired once, from
 * JS at app boot — if the second display hadn't finished enumerating yet at
 * that exact moment (a real race on cold boot), or it got unplugged/replugged
 * or came back after the device slept, nothing re-triggered `show()`. The
 * display then just fell back to the OS's default behavior (mirroring the
 * main screen) for the rest of the session instead of showing the dedicated
 * customer-facing surface.
 *
 * OnCreate deliberately does NOT eagerly call show() itself (only registers
 * the display listener) — this module's OnCreate fires as part of native
 * bridge/module setup, which reliably happens BEFORE the JS bundle has
 * finished executing app/_layout.tsx's top-level
 * AppRegistry.registerComponent("CustomerDisplay", ...) call. An eager show()
 * here raced ahead of that registration on cold boot and created the
 * Presentation with reactHost.createSurface() before "CustomerDisplay" was
 * registered, which renders as a permanent red-box error surface (RN's
 * "has not been registered" screen) — and since show()'s dedup guard only
 * checks presentation?.isShowing (an Android-level dialog-visibility flag,
 * not whether the React content inside actually rendered), that broken
 * surface was considered "already showing" forever after, so neither the
 * later JS setEnabled(true) call nor anything else ever retried it for the
 * rest of the session. JS's setEnabled(true) call (app/_layout.tsx, right
 * after registerCustomerDisplaySurface() on the very same synchronous tick)
 * is already guaranteed to fire only after registration completes, so it's
 * the correct sole trigger for the cold-boot case.
 */
class CustomerDisplayModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var presentation: CustomerPresentation? = null
  private var enabled = true
  private var listener: DisplayManager.DisplayListener? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val displayManager: DisplayManager
    get() = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

  private fun presentationDisplay(): Display? =
    displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull()

  override fun definition() = ModuleDefinition {
    Name("CustomerDisplay")

    OnCreate {
      registerDisplayListener()
    }

    AsyncFunction("isPresent") {
      presentationDisplay() != null
    }

    Function("setEnabled") { value: Boolean ->
      enabled = value
      // Force a fresh show() rather than trusting the dedup guard — JS calling
      // setEnabled(true) is a definitive "CustomerDisplay is registered now"
      // signal, so any stale/broken surface from an earlier attempt must be
      // torn down and recreated, not left in place.
      main.post { if (enabled) { hide(); show() } else hide() }
    }

    OnDestroy {
      listener?.let { displayManager.unregisterDisplayListener(it) }
      listener = null
      main.post { hide() }
    }
  }

  /** Re-shows on hotplug/reconnect/wake so the surface is never left mirroring. */
  private fun registerDisplayListener() {
    if (listener != null) return
    val l = object : DisplayManager.DisplayListener {
      override fun onDisplayAdded(displayId: Int) {
        main.post { if (enabled) show() }
      }
      override fun onDisplayRemoved(displayId: Int) {
        main.post { if (presentation?.display?.displayId == displayId) presentation = null }
      }
      override fun onDisplayChanged(displayId: Int) {
        main.post { if (enabled) show() }
      }
    }
    displayManager.registerDisplayListener(l, main)
    listener = l
  }

  private fun show() {
    val display = presentationDisplay() ?: return
    if (presentation?.display?.displayId == display.displayId && presentation?.isShowing == true) return
    hide()
    val outer = appContext.activityProvider?.currentActivity ?: context
    val p = CustomerPresentation(outer, display)
    try {
      p.show()
      presentation = p
    } catch (e: Exception) {
      presentation = null
    }
  }

  private fun hide() {
    presentation?.let { try { it.dismiss() } catch (_: Exception) { // Intentional no-op — caller handles null/missing state
    } }
    presentation = null
  }
}

private const val CUSTOMER_COMPONENT = "CustomerDisplay"

private class CustomerPresentation(
  outerContext: Context,
  display: Display,
) : Presentation(outerContext, display) {
  private var surface: ReactSurface? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val container = FrameLayout(context)
    setContentView(container)

    val app = context.applicationContext as? ReactApplication ?: return
    val reactHost = app.reactHost ?: return
    val s = reactHost.createSurface(context, CUSTOMER_COMPONENT, null)
    s.start()
    surface = s

    val view = s.view ?: return
    (view.parent as? ViewGroup)?.removeView(view)
    container.addView(
      view,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
  }

  override fun onStop() {
    super.onStop()
    surface?.let { try { it.stop() } catch (_: Exception) { // Intentional no-op — not used by this module
    } }
    surface = null
  }
}
