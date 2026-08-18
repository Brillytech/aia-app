import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Every tap in the app should route through here instead of calling
// expo-haptics directly — keeps behavior consistent and makes it a one-line
// change if we ever want to add a "reduce haptics" user setting.

function safeCall(fn: () => Promise<void>) {
  if (Platform.OS === "web") return;
  fn().catch(() => {});
}

export const haptics = {
  // Light tap — default for buttons, cards, tabs, toggles.
  tap: () => safeCall(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  // Slightly stronger — primary CTAs (Continue, Save, Submit).
  press: () => safeCall(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  // Selection change — segmented controls, filters, radio-style choices.
  select: () => safeCall(() => Haptics.selectionAsync()),

  success: () => safeCall(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safeCall(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safeCall(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
