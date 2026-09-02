package com.findxny426.escprinter

import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

private const val TAG = "EscPrinter"
private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

// ESC p 0 25 250 — pulse cash drawer pin 2 (most common wiring)
private val CASH_DRAWER_PIN2 = byteArrayOf(0x1B, 0x70, 0x00, 0x19.toByte(), 0xFA.toByte())

// ESC p 1 25 250 — pulse cash drawer pin 5 (some drawer models)
private val CASH_DRAWER_PIN5 = byteArrayOf(0x1B, 0x70, 0x01, 0x19.toByte(), 0xFA.toByte())

class EscPrinterModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("EscPrinter")

        AsyncFunction("openCashDrawer") {
            sendBytes(CASH_DRAWER_PIN2 + CASH_DRAWER_PIN5)
        }

        AsyncFunction("printRaw") { base64: String ->
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            Log.d(TAG, "printRaw: ${bytes.size} bytes")
            sendBytes(bytes)
        }

        AsyncFunction("printRawToDevice") { base64: String, address: String ->
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            Log.d(TAG, "printRawToDevice: ${bytes.size} bytes -> $address")
            sendBytesToDevice(bytes, address)
        }

        AsyncFunction("listUsbPrinters") {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            usbManager.deviceList.values
                .filter { d -> isPrinter(d) }
                .map { d ->
                    val vid = String.format("%04X", d.vendorId)
                    val pid = String.format("%04X", d.productId)
                    mapOf(
                        "name"          to (d.productName?.filter { it.code in 0x20..0x7E }?.trim()?.ifEmpty { null } ?: "USB Printer ($vid:$pid)"),
                        "manufacturer"  to (d.manufacturerName?.filter { it.code in 0x20..0x7E }?.trim() ?: ""),
                        "vendorId"      to vid,
                        "productId"     to pid,
                        "address"       to "$vid:$pid",
                        "hasPermission" to usbManager.hasPermission(d),
                    )
                }
        }

        // Return bonded (paired) Bluetooth devices — user must pair via Android Settings first.
        AsyncFunction("listBluetoothPrinters") {
            val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = btManager?.adapter
            Log.d(TAG, "listBluetoothPrinters: adapter=${adapter != null} enabled=${adapter?.isEnabled}")
            if (adapter == null || !adapter.isEnabled)
                return@AsyncFunction emptyList<Map<String, Any>>()

            val devices = adapter.bondedDevices ?: emptySet()
            Log.d(TAG, "listBluetoothPrinters: ${devices.size} bonded devices")
            devices.map { d ->
                Log.d(TAG, "  BT device: ${d.name} ${d.address} type=${d.type}")
                mapOf(
                    "name"    to (d.name ?: "Unknown"),
                    "address" to d.address,   // "AA:BB:CC:DD:EE:FF"
                    "type"    to when (d.type) { 1 -> "classic"; 2 -> "ble"; 3 -> "dual"; else -> "unknown" },
                )
            }
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private fun isPrinter(d: UsbDevice): Boolean =
        (0 until d.interfaceCount).any { d.getInterface(it).interfaceClass == UsbConstants.USB_CLASS_PRINTER }

    private fun sendBytes(bytes: ByteArray) {
        val devFile = File("/dev/printer0")
        Log.d(TAG, "sendBytes: /dev/printer0 exists=${devFile.exists()}")
        if (devFile.exists()) {
            try {
                FileOutputStream(devFile).use { it.write(bytes); it.flush() }
                Log.d(TAG, "sendBytes: /dev/printer0 write OK")
                return
            } catch (e: Exception) {
                Log.w(TAG, "sendBytes: /dev/printer0 write failed: ${e.message}")
            }
        }
        // Target INSA built-in chip specifically — never fall back to any USB printer
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val insaDevice = usbManager.deviceList.values.firstOrNull { d ->
            d.vendorId == 0x28E9 && d.productId == 0x0289
        }
        Log.d(TAG, "sendBytes: INSA chip (28E9:0289) found=${insaDevice != null}")
        if (insaDevice == null)
            throw Exception("Built-in printer not reachable: /dev/printer0 unavailable and INSA USB chip (28E9:0289) not found.")
        val hasPerm = usbManager.hasPermission(insaDevice)
        Log.d(TAG, "sendBytes: INSA chip hasPermission=$hasPerm")
        if (!hasPerm)
            throw Exception("USB permission not granted for built-in printer. Reconnect the device to trigger the permission dialog.")
        bulkWrite(usbManager, insaDevice, bytes)
    }

    private fun sendBytesToDevice(bytes: ByteArray, address: String) {
        // Bluetooth MAC: "AA:BB:CC:DD:EE:FF" — 17 chars with exactly 5 colons
        if (address.length == 17 && address.count { it == ':' } == 5) {
            Log.d(TAG, "sendBytesToDevice: Bluetooth path for $address")
            sendBytesBluetooth(bytes, address)
            return
        }
        // USB VID:PID: "VVVV:PPPP" — up to 9 chars with 1 colon
        if (address.contains(":") && address.length <= 9) {
            val parts = address.uppercase().split(":")
            if (parts.size == 2) {
                val vid = parts[0].toIntOrNull(16)
                val pid = parts[1].toIntOrNull(16)
                Log.d(TAG, "sendBytesToDevice: USB path VID=${parts[0]} PID=${parts[1]}")
                if (vid != null && pid != null) {
                    sendBytesUsbByVidPid(bytes, vid, pid, address)
                    return
                }
            }
        }
        // Fallback: device file path (e.g. /dev/ttyUSB0)
        Log.d(TAG, "sendBytesToDevice: file path $address")
        FileOutputStream(address).use { it.write(bytes); it.flush() }
    }

    private fun sendBytesBluetooth(bytes: ByteArray, macAddress: String) {
        val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            ?: throw Exception("Bluetooth not available on this device.")
        val adapter = btManager.adapter
            ?: throw Exception("Bluetooth not available on this device.")
        if (!adapter.isEnabled)
            throw Exception("Bluetooth is turned off. Enable Bluetooth in Settings and try again.")

        val device = try {
            adapter.getRemoteDevice(macAddress.uppercase())
        } catch (e: Exception) {
            throw Exception("Invalid Bluetooth address: $macAddress")
        }

        Log.d(TAG, "sendBytesBluetooth: connecting to ${device.name} ($macAddress)")
        adapter.cancelDiscovery()

            // Use insecure socket first — most cheap thermal BT printers don't require auth/PIN.
        // Fall back to secure socket if insecure fails.
        val socket: BluetoothSocket = try {
            device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
        } catch (e: Exception) {
            Log.w(TAG, "sendBytesBluetooth: insecure socket failed, trying secure: ${e.message}")
            device.createRfcommSocketToServiceRecord(SPP_UUID)
        }
        try {
            socket.connect()
            Log.d(TAG, "sendBytesBluetooth: connected, writing ${bytes.size} bytes")
            socket.outputStream.write(bytes)
            socket.outputStream.flush()
            Log.d(TAG, "sendBytesBluetooth: write OK")
        } finally {
            socket.close()
        }
    }

    private fun sendBytesUsbByVidPid(bytes: ByteArray, vid: Int, pid: Int, label: String) {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val allDevices = usbManager.deviceList.values.toList()
        Log.d(TAG, "sendBytesUsbByVidPid: $label — searching among ${allDevices.size} devices")
        allDevices.forEach { d ->
            Log.d(TAG, "  device: VID=${String.format("%04X",d.vendorId)} PID=${String.format("%04X",d.productId)} name=${d.productName} isPrinter=${isPrinter(d)}")
        }
        val device = allDevices.firstOrNull { d ->
            d.vendorId == vid && d.productId == pid && isPrinter(d)
        } ?: throw Exception("USB printer $label not found. Ensure it is connected.")

        val hasPerm = usbManager.hasPermission(device)
        Log.d(TAG, "sendBytesUsbByVidPid: found device, hasPermission=$hasPerm")
        if (!hasPerm)
            throw Exception("USB_PERMISSION_REQUIRED:$label — unplug and reconnect the printer to trigger the Android permission dialog.")

        bulkWrite(usbManager, device, bytes)
    }

    private fun bulkWrite(usbManager: UsbManager, device: UsbDevice, bytes: ByteArray) {
        val vid = String.format("%04X", device.vendorId)
        val pid = String.format("%04X", device.productId)
        Log.d(TAG, "bulkWrite: opening $vid:$pid (${device.productName}), ${bytes.size} bytes")
        val connection = usbManager.openDevice(device)
            ?: throw Exception("Cannot open USB device $vid:$pid.")
        try {
            val iface = (0 until device.interfaceCount)
                .map { device.getInterface(it) }
                .firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_PRINTER }
                ?: throw Exception("Device $vid:$pid has no USB printer interface (class 7).")

            Log.d(TAG, "bulkWrite: interfaceCount=${device.interfaceCount} endpointCount=${iface.endpointCount}")
            val claimed = connection.claimInterface(iface, true)
            Log.d(TAG, "bulkWrite: claimInterface=$claimed")
            if (!claimed)
                throw Exception("Cannot claim USB interface on $vid:$pid — printer may be in use by another app.")

            connection.setInterface(iface)

            val endpoint = (0 until iface.endpointCount)
                .map { iface.getEndpoint(it) }
                .also { eps -> eps.forEach { ep -> Log.d(TAG, "  endpoint dir=${ep.direction} type=${ep.type} maxPkt=${ep.maxPacketSize}") } }
                .firstOrNull { it.direction == UsbConstants.USB_DIR_OUT }
                ?: throw Exception("No bulk-OUT endpoint on $vid:$pid.")

            Log.d(TAG, "bulkWrite: OUT endpoint maxPacketSize=${endpoint.maxPacketSize}")
            var offset = 0
            while (offset < bytes.size) {
                val len = minOf(16_384, bytes.size - offset)
                val transferred = connection.bulkTransfer(endpoint, bytes, offset, len, 5_000)
                Log.d(TAG, "bulkWrite: bulkTransfer offset=$offset len=$len -> transferred=$transferred")
                if (transferred < 0)
                    throw Exception("USB write failed at byte $offset (returned $transferred). Printer may not be ready.")
                offset += transferred
            }
            Log.d(TAG, "bulkWrite: done, ${bytes.size} bytes sent to $vid:$pid")
        } finally {
            connection.close()
        }
    }
}
