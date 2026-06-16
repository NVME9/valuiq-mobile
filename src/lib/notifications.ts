// notifications.ts — free local scheduled notifications for the sale-capture moat.
// When a BUY scan happens, schedule a "Did it sell?" check-in ~12 days out.
// No server, no push tokens, no cost. Supplements the in-app prompt.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Show notifications even when app is foregrounded (so taps are consistent)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Ask for permission. Safe to call multiple times; returns true if granted.
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("sale-checkins", {
        name: "Sale Check-ins",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    return status === "granted";
  } catch {
    return false;
  }
}

// Schedule a check-in for one BUY scan. daysOut default 12.
// Stores the scanId in data so a tap can route to the capture.
export async function scheduleSaleCheckIn(
  scanId: string,
  itemName: string,
  daysOut = 12
): Promise<string | null> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;

    const seconds = Math.max(60, daysOut * 86400);
    const shortName = (itemName || "your item").length > 40
      ? (itemName || "your item").substring(0, 40) + "..."
      : (itemName || "your item");

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Did it sell? 💰",
        body: `Tap to log what happened with ${shortName} — keeps your profit stats accurate.`,
        data: { type: "sale_checkin", scanId },
        ...(Platform.OS === "android" ? { channelId: "sale-checkins" } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
    return id;
  } catch {
    return null;
  }
}

// Optional: cancel a scheduled check-in (e.g. if the user already marked it sold in-app).
export async function cancelSaleCheckIn(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

// Register a tap handler. Call once at app root. onTapScan receives the scanId.
export function addSaleCheckInTapListener(onTapScan: (scanId: string) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as any;
    if (data?.type === "sale_checkin" && data?.scanId) {
      onTapScan(data.scanId);
    }
  });
  return sub; // caller can sub.remove() on cleanup
}
