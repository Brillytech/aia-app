import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { sessionUser } from "../session";
import {
  colorForType,
  DEFAULT_PREFS,
  fetchNotifications,
  iconForType,
  PREF_STORAGE_KEY,
  readPreferences,
  type NotificationRow,
  type PreferenceKey,
} from "../notify";
import { AlertType, Theme, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import type { IconName } from "../ui/alerts";
import { Row, Rows } from "../ui/Rows";
import { PageHeader } from "../ui/PageHeader";
import { useBreakpoint } from "../ui/layout/breakpoints";
import { SplitPane } from "../ui/layout/SplitPane";
import { Screen } from "../ui/Screen";
import { SkeletonBar } from "../ui/Skeleton";
import { layout, radius, spacing, type, weight } from "../ui/tokens";

/** The row shape, named locally because this screen has always called it that. */
type NotificationItem = NotificationRow;
type NotificationPreference = {
  key: PreferenceKey;
  title: string;
  icon: IconName;
};

/**
 * Read-state for broadcast notifications lives in `public.notification_reads`,
 * keyed by (user_id, notification_id).
 *
 * Broadcast rows (`user_id IS NULL`) are one row shared by every student, so
 * their `is_read` column is global — the old code wrote to it, which meant one
 * person opening an announcement marked it read for the whole school, and
 * "Mark all read" did it to every announcement at once. Read state for a
 * shared row cannot live on that row, so it lives in a join table instead,
 * which also survives a reinstall and follows the user across devices.
 */

/**
 * Width at which the alert toggles move out of the feed and beside it.
 *
 * Higher than settings' 880: this needs a readable feed column AND a rail
 * wide enough for a label plus a switch, which does not fit until about here.
 * A feed squeezed to make room for preferences would be a worse trade.
 */
const NOTIFICATIONS_SPLIT = 1000;

/**
 * Exam alerts is gone. It promised warnings about exams the app has no way to
 * know about — it holds no timetable and no exam dates — so it was an offer it
 * could never keep.
 *
 * Activity & updates replaces it and sits last, because it is the catch-all:
 * leaderboard rank changes, new features, and announcements. Anything that is
 * not studying, practising, materials or the weekly report.
 */
const PREFERENCES: NotificationPreference[] = [
  { key: "study_reminders", title: "Study reminders", icon: "book-clock-outline" },
  { key: "practice_streaks", title: "Practice streaks", icon: "fire" },
  { key: "material_updates", title: "Material updates", icon: "file-document-plus-outline" },
  { key: "weekly_report", title: "Weekly report", icon: "chart-timeline-variant" },
  { key: "activity_updates", title: "Activity & updates", icon: "bell-badge-outline" },
];

function formatDate(value?: string | null) {
  if (!value) return "Just now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

/**
 * Where a notification is allowed to send you.
 *
 * An allow-list, not a pass-through. `action_url` is written by the admin app
 * and stored as free text; the screen used to push anything starting with a
 * slash straight into the router, so a typo or a renamed route navigated to
 * nothing and left the student on a dead screen.
 *
 * `/dashboard` is deliberately NOT here. It is where the app already opens, so
 * sending someone there is indistinguishable from dismissing the notification
 * — which is exactly what the one row in the table does today: a welcome
 * message pointing at `/dashboard`, which reads as a broken tap. A
 * notification that wants the dashboard wants nothing in particular, and
 * should not offer a tap at all.
 */
const DESTINATIONS = new Set([
  "/study",
  "/practice",
  "/exam",
  "/past-questions",
  "/leaderboard",
  "/weekly-report",
  "/profile",
  "/premium",
  "/settings",
  "/aia-tutorial",
]);

/** Falls back to the category when no usable link was written. */
function destinationForType(type?: string | null): string | null {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("practice")) return "/practice";
  if (clean.includes("exam")) return "/exam";
  if (clean.includes("report") || clean.includes("weekly")) return "/weekly-report";
  if (clean.includes("material")) return "/study";
  if (clean.includes("study")) return "/study";
  if (clean.includes("rank") || clean.includes("leaderboard")) return "/leaderboard";

  return null;
}

type Destination = { href: string; external: boolean };

/**
 * The one place that decides whether a notification is tappable.
 *
 * Both the chevron and the press handler read this, so a row cannot advertise
 * a tap that does nothing — which was the other half of the complaint: an
 * external `https://` link failed the `startsWith("/")` check and was silently
 * ignored, while the chevron beside it still said there was somewhere to go.
 */
function destinationFor(item: NotificationItem): Destination | null {
  const raw = String(item.action_url || "").trim();

  if (/^https?:\/\//i.test(raw)) return { href: raw, external: true };

  if (raw.startsWith("/")) {
    const route = raw.split("?")[0].replace(/\/+$/, "");
    if (DESTINATIONS.has(route)) return { href: raw, external: false };
  }

  const byType = destinationForType(item.type);

  return byType ? { href: byType, external: false } : null;
}

/** Widths that differ per row, so the block reads as messages not a grid. */
const SKEL_TITLES = [148, 116, 172, 132, 160];
const SKEL_BODIES = ["78%", "62%", "85%", "70%", "58%"];

/**
 * A notification row with nothing in it yet: the 20pt glyph, a title over a
 * message, and the date on the right. Same direction, gap and vertical
 * padding as Row, so nothing shifts when the real rows arrive.
 */
function NotificationSkeleton({ theme, rows = 4 }: { theme: Theme; rows?: number }) {
  return (
    <>
      {SKEL_TITLES.slice(0, rows).map((title, index) => (
        <View key={index} style={styles.skelRow}>
          <SkeletonBar theme={theme} width={20} height={20} rounded={6} />

          <View style={styles.skelBody}>
            <SkeletonBar theme={theme} width={title} height={14} />
            <SkeletonBar
              theme={theme}
              width={SKEL_BODIES[index]}
              height={11}
              style={styles.skelSecond}
            />
          </View>

          <SkeletonBar theme={theme} width={58} height={12} />
        </View>
      ))}
    </>
  );
}

/**
 * The alerts pane. One row per real preference, with a switch-shaped
 * placeholder — the switch is the widest thing in the row, and leaving it out
 * would let the list reflow sideways when the real ones mount.
 */
function AlertsSkeleton({ theme }: { theme: Theme }) {
  return (
    <>
      {PREFERENCES.map((pref, index) => (
        <View key={pref.key} style={styles.skelRow}>
          <SkeletonBar theme={theme} width={20} height={20} rounded={6} />
          <View style={styles.skelBody}>
            <SkeletonBar theme={theme} width={index % 2 ? 104 : 128} height={14} />
          </View>
          <SkeletonBar theme={theme} width={44} height={26} rounded={13} />
        </View>
      ))}

      {/* Push notifications: a title over a status line, no switch. */}
      <View style={styles.skelRow}>
        <SkeletonBar theme={theme} width={20} height={20} rounded={6} />
        <View style={styles.skelBody}>
          <SkeletonBar theme={theme} width={136} height={14} />
          <SkeletonBar theme={theme} width={92} height={11} style={styles.skelSecond} />
        </View>
      </View>
    </>
  );
}

export default function NotificationsPage() {
  const { theme } = useThemeMode();
  const wide = useBreakpoint(NOTIFICATIONS_SPLIT);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<Record<PreferenceKey, boolean>>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [readBroadcasts, setReadBroadcasts] = useState<Set<string>>(new Set());

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });

  /**
   * Read-state resolver. A personal row carries its own `is_read`; a broadcast
   * row's read-state is this device's, never the shared column's.
   *
   * Memoised so the two lists below can depend on it directly rather than on
   * the set it closes over.
   */
  const isRead = useCallback(
    (item: NotificationItem) =>
      item.user_id ? Boolean(item.is_read) : readBroadcasts.has(item.id),
    [readBroadcasts],
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !isRead(item)).length,
    [notifications, isRead],
  );

  const visibleNotifications = useMemo(
    () => (unreadOnly ? notifications.filter((item) => !isRead(item)) : notifications),
    [notifications, unreadOnly, isRead],
  );

  async function loadReadBroadcasts() {
    const user = await sessionUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_id", user.id);

    if (error) {
      console.log("READ RECEIPTS LOAD ERROR:", error.message);
      return;
    }

    setReadBroadcasts(new Set((data || []).map((row: any) => String(row.notification_id))));
  }

  /**
   * Records read receipts for broadcast notifications.
   *
   * Optimistic: local state moves first so the dot clears on tap, and a failed
   * write is rolled back rather than left showing a read state the server does
   * not have. `upsert` because re-reading an announcement is not an error —
   * the primary key is (user_id, notification_id).
   */
  async function persistReadBroadcasts(ids: string[]) {
    if (ids.length === 0) return;

    const user = await sessionUser();

    if (!user) return;

    const previous = readBroadcasts;
    setReadBroadcasts(new Set([...previous, ...ids]));

    const { error } = await supabase
      .from("notification_reads")
      .upsert(
        ids.map((notification_id) => ({ user_id: user.id, notification_id })),
        { onConflict: "user_id,notification_id" },
      );

    if (error) {
      console.log("READ RECEIPT SAVE ERROR:", error.message);
      setReadBroadcasts(previous);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadNotifications();
    } finally {
      setRefreshing(false);
    }
  }

  function showAlert(type: AlertType, title: string, message: string) {
    setAlert({
      visible: true,
      type,
      title,
      message,
    });
  }

  function closeAlert() {
    setAlert((prev) => ({ ...prev, visible: false }));
  }

  async function loadPreferences() {
    setPreferences(await readPreferences());
  }

  async function savePreferences(nextPrefs: Record<PreferenceKey, boolean>) {
    setSavingPrefs(true);

    try {
      await AsyncStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(nextPrefs));
      setPreferences(nextPrefs);
    } finally {
      setSavingPrefs(false);
    }
  }

  async function togglePreference(key: PreferenceKey) {
    const nextPrefs = {
      ...preferences,
      [key]: !preferences[key],
    };

    await savePreferences(nextPrefs);
  }

  async function loadNotifications() {
    // No `setLoading(true)` here. It starts true, and the only other caller is
    // pull-to-refresh, which drives its own `refreshing` flag. Dropping it also
    // means this function's first statement is an await rather than a state
    // write, which is what `react-hooks/set-state-in-effect` requires of
    // anything the mount effect calls.
    try {
      // The targeting rules live in notify.ts, because the app-open popup
      // check asks exactly the same question, and a second copy of those
      // five `or` clauses would drift the first time a target column changed.
      setNotifications(await fetchNotifications());
    } finally {
      setLoading(false);
    }
  }

  // Declared after the three loaders it calls, rather than above them: the
  // hoisting worked either way, but the compiler lint reads lexical order and
  // flags a function used before its declaration.
  //
  // Kicked off from a microtask rather than called straight from the effect
  // body, so no state write happens during the effect itself.
  useEffect(() => {
    Promise.resolve().then(() =>
      Promise.all([loadPreferences(), loadReadBroadcasts(), loadNotifications()]),
    );
  }, []);

  async function markAsRead(item: NotificationItem) {
    // Broadcast: a receipt row of this user's own. Writing `is_read` on the
    // shared row would mark the announcement read for every student who can
    // see it.
    if (!item.user_id) {
      await persistReadBroadcasts([item.id]);
      return;
    }

    setNotifications((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)),
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", item.id);

    if (error) console.log("NOTIFICATION READ ERROR:", error.message);
  }

  async function markAllAsRead() {
    const user = await sessionUser();

    setNotifications((prev) =>
      prev.map((row) => (row.user_id ? { ...row, is_read: true } : row)),
    );

    // Broadcasts get receipt rows; only the rows this user owns are updated
    // in place. `eq("is_read", false)` keeps that update to rows needing it.
    const broadcastIds = notifications
      .filter((row) => !row.user_id && !readBroadcasts.has(row.id))
      .map((row) => row.id);

    await persistReadBroadcasts(broadcastIds);

    if (user) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) console.log("NOTIFICATION READ ALL ERROR:", error.message);
    }

    showAlert("success", "All caught up", "Every notification has been marked as read.");
  }

  async function openNotification(item: NotificationItem) {
    if (!isRead(item)) await markAsRead(item);

    const destination = destinationFor(item);
    if (!destination) return;

    if (destination.external) {
      // Was silently dropped. A link to a form or an announcement page is a
      // reasonable thing for an announcement to carry.
      Linking.openURL(destination.href).catch((error) => {
        console.log("NOTIFICATION LINK ERROR:", error);
      });
      return;
    }

    router.push(destination.href as any);
  }


  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        measure={wide ? "app" : "prose"}
        theme={theme}
        title="Notifications"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
          />
        }
        // Mark-all belongs in the chrome, not as the last row of the list it
        // acts on — down there it scrolled away exactly when you had read
        // enough to want it, and it looked like another notification.
        right={
          unreadCount > 0 ? (
            <Pressable onPress={markAllAsRead} hitSlop={12}>
              <MaterialCommunityIcons name="check-all" size={22} color={theme.accent} />
            </Pressable>
          ) : null
        }
      >
        {/* Placeholders in the real chrome rather than a spinner on a screen
            of its own — which is what this was, so the entire layout arrived
            at once. Both arrangements are covered: the feed and the alerts
            rail side by side when there is room, stacked when there is not. */}
        {loading ? (
          wide ? (
            <SplitPane
              theme={theme}
              side="end"
              railWidth={280}
              divider={false}
              rail={
                <Rows theme={theme} title="Alerts">
                  <AlertsSkeleton theme={theme} />
                </Rows>
              }
            >
              <Rows theme={theme} title="Recent">
                <NotificationSkeleton theme={theme} />
              </Rows>
            </SplitPane>
          ) : (
            <>
              <Rows theme={theme} title="Recent">
                <NotificationSkeleton theme={theme} />
              </Rows>

              <Rows theme={theme} title="Alerts">
                <AlertsSkeleton theme={theme} />
              </Rows>
            </>
          )
        ) : (
          <>
          {wide ? (
            <SplitPane
              theme={theme}
              // Preferences follow the feed: the feed is what the screen is for,
              // and a settings rail leading the page would invert that.
              side="end"
              railWidth={280}
              divider={false}
              rail={
                <View>
                  <Text style={[styles.railTitle, { color: theme.muted }]}>Alerts</Text>
              <Rows theme={theme} title={wide ? undefined : "Alerts"}>
                {PREFERENCES.map((item) => (
                  <Row
                    key={item.key}
                    theme={theme}
                    icon={item.icon}
                    label={item.title}
                    accessory={
                      <Switch
                        value={preferences[item.key]}
                        onValueChange={() => togglePreference(item.key)}
                        disabled={savingPrefs}
                        trackColor={{ false: theme.soft, true: theme.accent }}
                        thumbColor={theme.card}
                        ios_backgroundColor={theme.soft}
                      />
                    }
                  />
                ))}

                {/* Was its own "Device" section — a card and a shadow around one
                    row. It belongs with the alert toggles it sits beside anyway:
                    both answer "what reaches me, and how". */}
                <Row
                  theme={theme}
                  icon="cellphone-message"
                  label="Push notifications"
                  value={wide ? undefined : "Not connected"}
                  secondary={wide ? "Not connected" : undefined}
                  onPress={() =>
                    showAlert(
                      "info",
                      "Push Notifications",
                      "Device push notifications will be connected before the final production build."
                    )
                  }
                />
              </Rows>
                </View>
              }
            >
            <Rows
              theme={theme}
              title={unreadOnly ? "Unread" : "Recent"}
              action={
                unreadCount > 0 || unreadOnly
                  ? {
                      label: unreadOnly ? "Show all" : `${unreadCount} unread`,
                      onPress: () => setUnreadOnly((prev) => !prev),
                    }
                  : undefined
              }
            >
              {visibleNotifications.length === 0 ? (
                <Row
                  theme={theme}
                  icon={unreadOnly ? "check-circle-outline" : "bell-sleep-outline"}
                  label={unreadOnly ? "Nothing unread" : "No notifications yet"}
                  chevron={false}
                />
              ) : (
                visibleNotifications.map((item) => {
                  const read = isRead(item);

                  return (
                    <Row
                      key={item.id}
                      theme={theme}
                      icon={iconForType(item.type)}
                      iconColor={colorForType(item.type, theme)}
                      label={item.title}
                      secondary={item.message}
                      value={formatDate(item.created_at)}
                      chevron={Boolean(destinationFor(item))}
                      accessory={
                        read ? undefined : (
                          <View
                            style={[
                              styles.unreadDot,
                              { backgroundColor: colorForType(item.type, theme) },
                            ]}
                          />
                        )
                      }
                      onPress={() => openNotification(item)}
                    />
                  );
                })
              )}
            </Rows>
            </SplitPane>
          ) : (
            <>
          <Rows
            theme={theme}
            title={unreadOnly ? "Unread" : "Recent"}
            action={
              unreadCount > 0 || unreadOnly
                ? {
                    label: unreadOnly ? "Show all" : `${unreadCount} unread`,
                    onPress: () => setUnreadOnly((prev) => !prev),
                  }
                : undefined
            }
          >
            {visibleNotifications.length === 0 ? (
              <Row
                theme={theme}
                icon={unreadOnly ? "check-circle-outline" : "bell-sleep-outline"}
                label={unreadOnly ? "Nothing unread" : "No notifications yet"}
                chevron={false}
              />
            ) : (
              visibleNotifications.map((item) => {
                const read = isRead(item);

                return (
                  <Row
                    key={item.id}
                    theme={theme}
                    icon={iconForType(item.type)}
                    iconColor={colorForType(item.type, theme)}
                    label={item.title}
                    secondary={item.message}
                    value={formatDate(item.created_at)}
                    chevron={Boolean(destinationFor(item))}
                    accessory={
                      read ? undefined : (
                        <View
                          style={[
                            styles.unreadDot,
                            { backgroundColor: colorForType(item.type, theme) },
                          ]}
                        />
                      )
                    }
                    onPress={() => openNotification(item)}
                  />
                );
              })
            )}
          </Rows>

          <Rows theme={theme} title="Alerts">
            {PREFERENCES.map((item) => (
              <Row
                key={item.key}
                theme={theme}
                icon={item.icon}
                label={item.title}
                accessory={
                  <Switch
                    value={preferences[item.key]}
                    onValueChange={() => togglePreference(item.key)}
                    disabled={savingPrefs}
                    trackColor={{ false: theme.soft, true: theme.accent }}
                    thumbColor={theme.card}
                    ios_backgroundColor={theme.soft}
                  />
                }
              />
            ))}

            {/* Was its own "Device" section — a card and a shadow around one
                row. It belongs with the alert toggles it sits beside anyway:
                both answer "what reaches me, and how". */}
            <Row
              theme={theme}
              icon="cellphone-message"
              label="Push notifications"
              value="Not connected"
              onPress={() =>
                showAlert(
                  "info",
                  "Push Notifications",
                  "Device push notifications will be connected before the final production build."
                )
              }
            />
          </Rows>
            </>
          )}
          </>
        )}
      </PageHeader>

      <AlertModal
        theme={theme}
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        primaryLabel="OK"
        onPrimary={closeAlert}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
  },
  // --- loading placeholders ------------------------------------------------
  /** Matches Row exactly: same direction, gap and vertical padding. */
  skelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  skelBody: {
    flex: 1,
  },
  skelSecond: {
    marginTop: spacing.xs + 2,
  },
  // The rail's own label. Not a Rows title — that sits inside the group,
  // and here the group IS the rail.
  railTitle: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
    marginBottom: spacing.sm,
  },
  unreadDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.pill,
  },
});
