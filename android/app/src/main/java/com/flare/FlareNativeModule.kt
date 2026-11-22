package com.flare

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File

/**
 * Small platform helpers Flare needs and no lean library covers:
 * battery state for the mesh SDK, and saving an image to a file the map can load.
 */
class FlareNativeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "FlareNative"

  @ReactMethod
  fun getBattery(promise: Promise) {
    // Sticky broadcast: returns the last battery status without registering a receiver.
    val status = reactApplicationContext.registerReceiver(
      null,
      IntentFilter(Intent.ACTION_BATTERY_CHANGED),
    )
    val level = status?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = status?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
    val plugged = status?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
    val result = Arguments.createMap()
    result.putDouble("level", if (level >= 0 && scale > 0) level * 100.0 / scale else -1.0)
    result.putBoolean("charging", plugged != 0)
    promise.resolve(result)
  }

  /** Writes base64 bytes to the app's private files dir; resolves a file:// URL. */
  @ReactMethod
  fun writeFile(name: String, base64: String, promise: Promise) {
    if (!SAFE_NAME.matches(name)) {
      promise.reject("invalid_name", "File name must be letters, digits, dot, dash or underscore.")
      return
    }
    try {
      val dir = File(reactApplicationContext.filesDir, "flare").apply { mkdirs() }
      val file = File(dir, name)
      file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
      // file:///… — MapLibre rejects the single-slash form File.toURI() gives.
      promise.resolve("file://" + file.absolutePath)
    } catch (e: Exception) {
      promise.reject("write_failed", e.message, e)
    }
  }

  @ReactMethod
  fun deleteFile(name: String, promise: Promise) {
    if (!SAFE_NAME.matches(name)) {
      promise.resolve(false)
      return
    }
    promise.resolve(File(File(reactApplicationContext.filesDir, "flare"), name).delete())
  }

  companion object {
    private val SAFE_NAME = Regex("^[A-Za-z0-9._-]{1,128}$")
  }
}

class FlareNativePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(FlareNativeModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
