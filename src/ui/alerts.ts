import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { AlertType, Theme } from "../theme";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * The colour an alert of this type should wear. Takes the active theme rather
 * than reading a bare constant, so a future palette pass can brighten
 * semantics on dark without touching the seven screens that show alerts.
 *
 * Note `warning` resolves to `theme.warning` (amber), not the accent. They used
 * to be the same orange, which meant changing the brand accent would silently
 * recolour every warning dialog in the app.
 */
export function alertColor(type: AlertType, theme: Theme): string {
  switch (type) {
    case "success":
      return theme.success;
    case "error":
      return theme.error;
    case "warning":
      return theme.warning;
    default:
      return theme.info;
  }
}

/**
 * Typed against the real icon-name union, so call sites no longer need
 * `getAlertIcon() as any`.
 */
export const alertIcon: Record<AlertType, IconName> = {
  success: "check-circle-outline",
  error: "alert-circle-outline",
  warning: "alert-outline",
  info: "information-outline",
};
