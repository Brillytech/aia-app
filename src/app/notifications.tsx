import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { AlertType, category, Theme, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import type { IconName } from "../ui/alerts";
import { dividerInset, ListRow, ListSection } from "../ui/List";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { layout, radius, spacing, type } from "../ui/tokens";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  is_read?: boolean | null;
  action_url?: string | null;
  created_at?: string | null;
  /** Null marks a broadcast row shared by every student. */
  user_id?: string | null;
};

type PreferenceKey =
  | "study_reminders"
  | "practice_streaks"
  | "exam_alerts"
  | "material_updates"
  | "weekly_report";

type NotificationPreference = {
  key: PreferenceKey;
  title: string;
  icon: IconName;
};

const PREF_STORAGE_KEY = "lasu_scholar_notification_preferences";

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

const DEFAULT_PREFS: Record<PreferenceKey, boolean> = {
  study_reminders: true,
  practice_streaks: true,
  exam_alerts: true,
  material_updates: true,
  weekly_report: true,
};

// Subtitles removed: all five restated their own title ("Study Reminders" /
// "Gentle nudges to continue your study streak."). The switch is the content.
const PREFERENCES: NotificationPreference[] = [
  { key: "study_reminders", title: "Study reminders", icon: "book-clock-outline" },
  { key: "practice_streaks", title: "Practice streaks", icon: "fire" },
  { key: "exam_alerts", title: "Exam alerts", icon: "clipboard-alert-outline" },
  { key: "material_updates", title: "Material updates", icon: "file-document-plus-outline" },
  { key: "weekly_report", title: "Weekly report", icon: "chart-timeline-variant" },
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

function getNotificationIcon(type?: string | null): IconName {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("exam")) return "clipboard-text-clock-outline";
  if (clean.includes("practice")) return "target";
  if (clean.includes("study")) return "book-open-page-variant-outline";
  if (clean.includes("material")) return "file-document-outline";
  if (clean.includes("xp")) return "star-four-points";
  if (clean.includes("warning")) return "alert-outline";

  return "bell-outline";
}

// Every literal this used to return had an exact token equivalent, so these
// are the same colours by value — just sourced from one place now.
function getNotificationColor(type: string | null | undefined, theme: Theme) {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("exam")) return category.red;
  if (clean.includes("practice")) return category.orange;
  if (clean.includes("study")) return category.blue;
  if (clean.includes("material")) return category.green;
  if (clean.includes("xp")) return category.purple;
  if (clean.includes("warning")) return theme.warning;

  return category.teal;
}

export default function NotificationsPage() {
  const { theme } = useThemeMode();

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
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

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

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

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
    try {
      const saved = await AsyncStorage.getItem(PREF_STORAGE_KEY);

      if (saved) {
        setPreferences({
          ...DEFAULT_PREFS,
          ...JSON.parse(saved),
        });
      }
    } catch {
      setPreferences(DEFAULT_PREFS);
    }
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
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        setNotifications([]);
        return;
      }

      // The `notifications` table carries publishing, expiry and five
      // targeting columns that this screen used to ignore completely — it
      // asked only "is it mine or is it a broadcast". That meant students saw
      // unpublished drafts, notifications past their expiry, and broadcasts
      // aimed at other schools, departments and levels.
      const { data: profile } = await supabase
        .from("profiles")
        .select("school, faculty, department, level, role")
        .eq("id", user.id)
        .maybeSingle();

      let query = supabase
        .from("notifications")
        .select("id, title, message, type, is_read, action_url, created_at, user_id")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        // NULL counts as published/never-expiring so rows written before
        // these columns existed keep showing.
        .or("is_published.is.null,is_published.eq.true")
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      // A null target means "everyone", so each filter is
      // "unset OR matches me". Values are quoted because department and
      // faculty names contain spaces and commas, which are PostgREST
      // filter syntax.
      const targets: [string, string | null | undefined][] = [
        ["target_school", profile?.school],
        ["target_faculty", profile?.faculty],
        ["target_department", profile?.department],
        ["target_level", profile?.level],
        ["target_role", profile?.role],
      ];

      targets.forEach(([column, value]) => {
        query = value
          ? query.or(`${column}.is.null,${column}.eq."${String(value).replace(/"/g, '\\"')}"`)
          : query.is(column, null);
      });

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.log("NOTIFICATIONS ERROR:", error.message);
        setNotifications([]);
        return;
      }

      setNotifications((data || []) as NotificationItem[]);
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
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

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

    if (!item.action_url) return;

    if (item.action_url.startsWith("/")) {
      router.push(item.action_url as any);
    }
  }

  if (loading) {
    return (
      <Screen backgroundColor={theme.bg}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingTitle, { color: theme.muted }]}>
            Loading notifications
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        measure="prose"
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
        <ListSection
          theme={theme}
          title={unreadOnly ? "Unread" : "Recent"}
          inset={dividerInset.plate}
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
            <ListRow
              theme={theme}
              icon={unreadOnly ? "check-circle-outline" : "bell-sleep-outline"}
              label={unreadOnly ? "Nothing unread" : "No notifications yet"}
              chevron={false}
            />
          ) : (
            visibleNotifications.map((item) => {
              const read = isRead(item);

              return (
                <ListRow
                  key={item.id}
                  theme={theme}
                  icon={getNotificationIcon(item.type)}
                  iconColor={getNotificationColor(item.type, theme)}
                  label={item.title}
                  secondary={item.message}
                  value={formatDate(item.created_at)}
                  chevron={Boolean(item.action_url)}
                  accessory={
                    read ? undefined : (
                      <View
                        style={[
                          styles.unreadDot,
                          { backgroundColor: getNotificationColor(item.type, theme) },
                        ]}
                      />
                    )
                  }
                  onPress={() => openNotification(item)}
                />
              );
            })
          )}
        </ListSection>

        <ListSection theme={theme} title="Alerts">
          {PREFERENCES.map((item) => (
            <ListRow
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
          <ListRow
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
        </ListSection>
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
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingTitle: {
    ...type.body,
  },
  unreadDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.pill,
  },
});
