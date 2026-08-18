import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { AlertType, category, medal, Theme, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import { ListRow, ListSection } from "../ui/List";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";

type LeaderboardUser = {
  user_id: string;
  xp: number;
  rank: number;
  displayName: string;
  department?: string | null;
  level?: string | null;
  avatar_url?: string | null;
  isMe?: boolean;
};

type RangeKey = "weekly" | "monthly" | "all_time";

const RANGES: readonly { value: RangeKey; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "all_time", label: "All time" },
];

const AVATAR = 32;
const RANK_NUM = 22;
/** paddingHorizontal + rank number + inner gap + avatar + row gap. */
const RANK_INSET = spacing.lg + RANK_NUM + spacing.sm + AVATAR + spacing.md;

function getWeekStartIso(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);

  current.setDate(diff);
  current.setHours(0, 0, 0, 0);

  return current.toISOString();
}

function getMonthStartIso(date = new Date()) {
  const current = new Date(date);
  current.setDate(1);
  current.setHours(0, 0, 0, 0);

  return current.toISOString();
}

function getInitials(name: string) {
  const cleanName = String(name || "Student").trim();
  const parts = cleanName.split(" ").filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return cleanName.slice(0, 2).toUpperCase();
}

/** Rows mounted per page. */
const PAGE_SIZE = 25;

/** Thousands separators, because #1247 is unreadable at a glance. */
function formatRank(rank: number) {
  return `#${rank.toLocaleString()}`;
}

function formatXp(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;

  return String(value);
}

function getRankColor(rank: number) {
  if (rank === 1) return medal.gold;
  if (rank === 2) return medal.silver;
  if (rank === 3) return medal.bronze;

  return category.orange;
}

export default function LeaderboardPage() {
  const { theme } = useThemeMode();

  const [range, setRange] = useState<RangeKey>("weekly");
  const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const podium = useMemo(() => leaders.slice(0, 3), [leaders]);

  const rangeLabel =
    RANGES.find((entry) => entry.value === range)?.label ?? "This week";
  const rest = useMemo(() => leaders.slice(3), [leaders]);

  // True when your own row is already on screen — either on the podium or
  // inside the slice of rankings currently rendered. Only when it is not does
  // the appended "You" row need to exist.
  const myRankVisible = useMemo(() => {
    if (!myRank) return false;
    if (myRank.rank <= 3) return true;

    return rest.slice(0, visibleCount).some((item) => item.isMe);
  }, [myRank, rest, visibleCount]);

  useEffect(() => {
    loadLeaderboard();
  }, [range]);

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

  function getRangeStart() {
    if (range === "weekly") return getWeekStartIso();
    if (range === "monthly") return getMonthStartIso();

    return null;
  }

  async function loadLeaderboard() {
    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const rangeStart = getRangeStart();

      let query = supabase.from("xp_events").select("user_id, xp, created_at, week_start");

      if (rangeStart) {
        if (range === "weekly") {
          query = query.gte("week_start", rangeStart);
        } else {
          query = query.gte("created_at", rangeStart);
        }
      }

      const { data: xpRows, error: xpError } = await query.limit(5000);

      if (xpError) {
        console.log("LEADERBOARD XP ERROR:", xpError.message);
        setLeaders([]);
        setMyRank(null);
        showAlert("error", "Leaderboard Error", "Could not load leaderboard right now.");
        return;
      }

      const xpByUser = new Map<string, number>();

      (xpRows || []).forEach((row: any) => {
        const userId = row.user_id;
        const nextXp = Number(row.xp || 0);

        if (!userId) return;

        xpByUser.set(userId, (xpByUser.get(userId) || 0) + nextXp);
      });

      const userIds = Array.from(xpByUser.keys());

      if (userIds.length === 0) {
        setLeaders([]);
        setMyRank(null);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, full_name, email, department, level, avatar_url, photo_url, image_url")
        .in("id", userIds);

      if (profilesError) {
        console.log("LEADERBOARD PROFILE ERROR:", profilesError.message);
      }

      const profileMap = new Map<string, any>();

      (profilesData || []).forEach((profile: any) => {
        profileMap.set(profile.id, profile);
      });

      const ranked = userIds
        .map((userId) => {
          const profile = profileMap.get(userId);
          const displayName =
            profile?.username ||
            profile?.full_name ||
            profile?.email?.split("@")[0] ||
            "LASU Scholar";

          return {
            user_id: userId,
            xp: xpByUser.get(userId) || 0,
            rank: 0,
            displayName,
            department: profile?.department || null,
            level: profile?.level || null,
            avatar_url: profile?.avatar_url || profile?.photo_url || profile?.image_url || null,
            isMe: userId === user.id,
          };
        })
        .sort((a, b) => b.xp - a.xp)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
        }));

      setLeaders(ranked.slice(0, 50));
      setMyRank(ranked.find((item) => item.user_id === user.id) || null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Screen backgroundColor={theme.bg}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingTitle, { color: theme.muted }]}>Loading leaderboard</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        title="Leaderboard"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
        right={
          <Pressable onPress={loadLeaderboard} hitSlop={12}>
            <MaterialCommunityIcons name="refresh" size={22} color={theme.text} />
          </Pressable>
        }
      >
        <Segmented
          theme={theme}
          value={range}
          options={RANGES}
          onChange={setRange}
          stretch
          style={styles.range}
        />

        {podium.length > 0 ? (
          <View style={styles.podiumBlock}>
            <Text style={[styles.blockTitle, { color: theme.muted }]}>Top students</Text>

            <View style={styles.podiumRow}>
              {podium.map((item) => (
                <TrophyMedal key={item.user_id} item={item} theme={theme} />
              ))}
            </View>
          </View>
        ) : null}

        {rest.length > 0 || leaders.length === 0 ? (
          <ListSection theme={theme} title="Rankings" inset={RANK_INSET}>
            {leaders.length === 0 ? (
              <ListRow
                theme={theme}
                icon="trophy-broken"
                label="No ranking yet"
                chevron={false}
              />
            ) : (
              // Rendered in pages. A cohort-wide board can run to thousands
              // of students, and mounting every row at once is what makes a
              // leaderboard janky long before the data layer gives up.
              rest.slice(0, visibleCount).map((item) => {
                const color = getRankColor(item.rank);

                return (
                  <ListRow
                    key={item.user_id}
                    theme={theme}
                    leading={
                      <View style={styles.rankLead}>
                        <Text style={[styles.rankNumber, { color: theme.muted }]}>
                          {item.rank}
                        </Text>
                        <Avatar user={item} size={AVATAR} />
                      </View>
                    }
                    label={item.displayName}
                    secondary={`${item.department || "LASU Scholar"} • ${item.level || "Student"}`}
                    value={`${formatXp(item.xp)} XP`}
                    chevron={false}
                    style={item.isMe ? { backgroundColor: withAlpha(color, 0.1) } : undefined}
                  />
                );
              })
            )}

            {rest.length > visibleCount ? (
              <ListRow
                theme={theme}
                label="Show more"
                value={`${rest.length - visibleCount} more`}
                onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
              />
            ) : null}

            {/* Replaces the strip that used to be pinned across the bottom of
                the screen. That bar covered content on every scroll and
                repeated a row the list already had whenever you were in the
                top few. Your position now joins the list itself — appended
                with a gap when you rank below the visible window, so it is
                still one tap away without permanently costing a band of the
                screen. */}
            {myRank && !myRankVisible ? (
              <ListRow
                theme={theme}
                leading={
                  <View style={styles.rankLead}>
                    <Text style={[styles.rankNumber, { color: theme.accent }]}>
                      {myRank.rank}
                    </Text>
                    <Avatar user={myRank} size={AVATAR} />
                  </View>
                }
                label="You"
                secondary={`${rangeLabel} · ${formatRank(myRank.rank)} of ${leaders.length}`}
                value={`${formatXp(myRank.xp)} XP`}
                chevron={false}
                style={{ backgroundColor: withAlpha(theme.accent, 0.1) }}
              />
            ) : null}
          </ListSection>
        ) : null}
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

function Avatar({ user, size = AVATAR }: { user: LeaderboardUser; size?: number }) {
  const color = getRankColor(user.rank);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(color, 0.16),
        },
      ]}
    >
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} resizeMode="cover" />
      ) : (
        <Text style={[styles.avatarText, { color, fontSize: size * 0.36 }]}>
          {getInitials(user.displayName)}
        </Text>
      )}
    </View>
  );
}

/**
 * A top-three finisher as an engraved trophy rather than a card.
 *
 * The three winners used to be three bordered cards in a row — the same
 * container the rankings list below already used, so the podium read as "the
 * first three rows, but boxed". A trophy is the one object that says *placed*
 * without a label, and putting the position on the cup and the XP on the
 * plinth makes the award itself carry the numbers, the way a real one does.
 */
function TrophyMedal({ item, theme }: { item: LeaderboardUser; theme: Theme }) {
  const color = getRankColor(item.rank);
  const first = item.rank === 1;
  const size = first ? 92 : 74;

  return (
    <View style={[styles.medal, !first && styles.medalLower]}>
      <View style={{ width: size, height: size }}>
        <MaterialCommunityIcons
          name="trophy"
          size={size}
          color={color}
          style={styles.trophyGlyph}
        />

        {/* Engraved on the cup. The offset is a fraction of the glyph rather
            than a fixed pixel value, so the number stays centred in the bowl
            at both sizes. */}
        <View style={[styles.engraving, { top: size * 0.26 }]}>
          <Text
            style={[
              styles.engravedRank,
              { color: theme.bg, fontSize: size * 0.3 },
            ]}
          >
            {item.rank}
          </Text>
        </View>
      </View>

      {/* The plinth carries the score, so the trophy is a complete award on
          its own and the name below is just attribution. */}
      <View style={[styles.plinth, { backgroundColor: color }]}>
        <Text style={[styles.plinthText, { color: theme.bg }]}>
          {formatXp(item.xp)} XP
        </Text>
      </View>

      <Text
        style={[
          styles.medalName,
          { color: item.isMe ? color : theme.text },
        ]}
        numberOfLines={1}
      >
        {item.isMe ? "You" : item.displayName}
      </Text>
    </View>
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
  range: {
    marginBottom: spacing.xxl,
  },
  blockTitle: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  podiumBlock: {
    marginBottom: spacing.xxxl,
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: spacing.md,
  },
  medal: {
    flex: 1,
    alignItems: "center",
  },
  // Ranks 2 and 3 stand lower than the winner — the podium shape, done with
  // offset rather than with three boxes of different heights.
  medalLower: {
    marginTop: spacing.xxl,
  },
  trophyGlyph: {
    // The glyph carries its own generous bearing; pulling it flush keeps the
    // plinth tight under the base instead of floating below it.
    marginTop: -2,
  },
  engraving: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  engravedRank: {
    fontWeight: weight.black,
  },
  plinth: {
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: -spacing.xs,
  },
  plinthText: {
    ...type.micro,
    letterSpacing: 0.4,
  },
  medalName: {
    ...type.caption,
    letterSpacing: 0,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  rankLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rankNumber: {
    width: RANK_NUM,
    ...type.body,
    fontWeight: weight.medium,
    textAlign: "center",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontWeight: weight.bold,
  },
});
