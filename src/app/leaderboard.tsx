import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { AlertType, category, medal, Theme, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import { Row, Rows } from "../ui/Rows";
import { PageHeader } from "../ui/PageHeader";
import { useBreakpoint } from "../ui/layout/breakpoints";
import { Screen } from "../ui/Screen";
import { SkeletonBar } from "../ui/Skeleton";
import { Segmented } from "../ui/Segmented";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";

/**
 * Width at which the rankings become a real table.
 *
 * Low compared with the other screens because a table needs less than a pair
 * of panes: five short columns fit well before a two-column layout would.
 */
const LEADERBOARD_SPLIT = 760;

/**
 * Column widths, shared by the header and every row so they cannot drift.
 * Student is the flexible one; the rest are fixed, which is what keeps long
 * names from pushing the score column out of alignment.
 */
const COL = {
  rank: 56,
  department: 190,
  level: 84,
  xp: 96,
};

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
  const wide = useBreakpoint(LEADERBOARD_SPLIT);
  const { theme } = useThemeMode();

  const [range, setRange] = useState<RangeKey>("weekly");
  const [leaders, setLeaders] = useState<LeaderboardUser[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardUser | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Separate from `loading` because your own rank is a separate question:
   * one row about you, not a page of the board. It moves with the main load
   * today and becomes independent the moment `my_rank()` lands, which is why
   * the You placeholder is wired to this rather than to `loading`.
   */
  const [myRankLoading, setMyRankLoading] = useState(true);

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
        // `photo_url` and `image_url` used to be in this list. Neither column
        // exists on `profiles`, and PostgREST rejects the WHOLE select when one
        // name is unknown (42703) — so this query returned nothing at all, the
        // profile map came back empty, and every single row on the board fell
        // through to the last fallback and read "LASU Scholar". The data was
        // always fine: 15 of 17 profiles have a real username.
        .select("id, username, full_name, email, department, level, avatar_url")
        .in("id", userIds);

      // Fatal, not a note in the console. Without profiles the board cannot
      // name anyone, and a page of identical placeholder names looks like
      // working software — which is exactly why the bug above survived. The
      // XP failure beside this one has always been treated this way.
      if (profilesError) {
        console.log("LEADERBOARD PROFILE ERROR:", profilesError.message);
        setLeaders([]);
        setMyRank(null);
        showAlert("error", "Leaderboard Error", "Could not load student names right now.");
        return;
      }

      const profileMap = new Map<string, any>();

      (profilesData || []).forEach((profile: any) => {
        profileMap.set(profile.id, profile);
      });

      const ranked = userIds
        .map((userId) => {
          const profile = profileMap.get(userId);
          // The last resort is deliberately not the app's own name. Every row
          // reading "LASU Scholar" looked like a board full of students who had
          // all chosen the same handle, rather than like missing data.
          const displayName =
            profile?.username ||
            profile?.full_name ||
            profile?.email?.split("@")[0] ||
            `Student ${String(userId).slice(0, 4)}`;

          return {
            user_id: userId,
            xp: xpByUser.get(userId) || 0,
            rank: 0,
            displayName,
            department: profile?.department || null,
            level: profile?.level || null,
            avatar_url: profile?.avatar_url || null,
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
      setMyRankLoading(false);
    }
  }


  function renderTableHead() {
    return (
      <View style={styles.tableHead}>
        <Text style={[styles.headCell, { width: COL.rank, color: theme.muted }]}>Rank</Text>
        <Text style={[styles.headCell, styles.flex1, { color: theme.muted }]}>Student</Text>
        <Text style={[styles.headCell, { width: COL.department, color: theme.muted }]}>Department</Text>
        <Text style={[styles.headCell, { width: COL.level, color: theme.muted }]}>Level</Text>
        <Text style={[styles.headCell, styles.right, { width: COL.xp, color: theme.muted }]}>XP</Text>
      </View>
    );
  }

  /**
   * One table row. Department and level get their own columns here rather
   * than being concatenated into a subtitle — aligned columns are the whole
   * reason a table beats a list at this width.
   */
  function renderTableRow(item: LeaderboardUser, highlight: boolean, nameOverride?: string) {
    const color = getRankColor(item.rank);

    return (
      <View
        key={item.user_id}
        style={[
          styles.tableRow,
          highlight ? { backgroundColor: withAlpha(color, 0.1) } : null,
        ]}
      >
        <Text style={[styles.rankCell, { width: COL.rank, color: highlight ? color : theme.muted }]}>
          {item.rank}
        </Text>

        <View style={[styles.studentCell, styles.flex1]}>
          <Avatar user={item} size={AVATAR} />
          <Text style={[styles.nameCell, { color: theme.text }]} numberOfLines={1}>
            {nameOverride ?? item.displayName}
          </Text>
        </View>

        <Text
          style={[styles.cell, { width: COL.department, color: theme.muted }]}
          numberOfLines={1}
        >
          {item.department || "—"}
        </Text>

        <Text style={[styles.cell, { width: COL.level, color: theme.muted }]} numberOfLines={1}>
          {item.level || "—"}
        </Text>

        <Text style={[styles.xpCell, styles.right, { width: COL.xp, color: theme.text }]} numberOfLines={1}>
          {formatXp(item.xp)}
        </Text>
      </View>
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

        {/* Placeholders, not a spinner, and inside the same header, tabs and
            section titles the real thing uses — so nothing on the page moves
            when the data lands. The spinner this replaces lived on a screen of
            its own, which meant the entire layout arrived at once. */}
        {loading ? (
          <>
            <PodiumSkeleton theme={theme} />

            <Rows theme={theme} title="Rankings">
              {wide ? renderTableHead() : null}
              <RankSkeleton theme={theme} wide={wide} />
              {myRankLoading ? <YouSkeleton theme={theme} wide={wide} /> : null}
            </Rows>
          </>
        ) : (
          <>
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
            <Rows theme={theme} title="Rankings">
              {wide ? renderTableHead() : null}
              {leaders.length === 0 ? (
                <Row
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

                  if (wide) return renderTableRow(item, Boolean(item.isMe));

                  return (
                    <Row
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
                      secondary={describeStudent(item)}
                      value={`${formatXp(item.xp)} XP`}
                      chevron={false}
                      style={item.isMe ? { backgroundColor: withAlpha(color, 0.1) } : undefined}
                    />
                  );
                })
              )}

              {rest.length > visibleCount ? (
                <Row
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
                wide ? renderTableRow(myRank, true, "You") : <Row
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
                  secondary={`${rangeLabel} · ${formatRank(myRank.rank)}`}
                  value={`${formatXp(myRank.xp)} XP`}
                  chevron={false}
                  style={{ backgroundColor: withAlpha(theme.accent, 0.1) }}
                />
              ) : null}
            </Rows>
          ) : null}
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
/**
 * The second line of a ranking row.
 *
 * Was `${department || "LASU Scholar"} • ${level || "Student"}`, which put the
 * app's name where a department belongs whenever one was missing. Missing
 * parts are now dropped rather than substituted.
 */
function describeStudent(item: LeaderboardUser) {
  const parts = [item.department, item.level].filter(Boolean);

  return parts.length ? parts.join(" • ") : "Student";
}

/**
 * The podium, before it has anyone on it.
 *
 * Same three footprints at the same two sizes, with ranks two and three
 * already standing lower — so the silhouette that arrives is the silhouette
 * that was there, and nothing moves when the names land.
 *
 * Winner on the LEFT, not centred. The real podium renders `leaders.slice(0,3)`
 * in rank order, so first place is leftmost; a centred tall placeholder would
 * have been a nicer picture of a different screen.
 */
function PodiumSkeleton({ theme }: { theme: Theme }) {
  return (
    <View style={styles.podiumBlock}>
      <SkeletonBar theme={theme} width={84} height={12} style={styles.skelBlockTitle} />

      <View style={styles.podiumRow}>
        {[1, 2, 3].map((rank) => {
          const first = rank === 1;
          const size = first ? 92 : 74;

          return (
            <View key={rank} style={[styles.medal, !first && styles.medalLower]}>
              {/* Narrower than it is tall, so it reads as a cup rather than a
                  tile, while still reserving the glyph's full box. */}
              <SkeletonBar theme={theme} width={size * 0.78} height={size} rounded={22} />
              <SkeletonBar
                theme={theme}
                width={54}
                height={16}
                rounded={radius.xs}
                style={styles.skelPlinth}
              />
              <SkeletonBar
                theme={theme}
                width={first ? 70 : 58}
                height={12}
                style={styles.skelMedalName}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Widths that vary per row, so the block reads as names rather than as a grid. */
const SKEL_NAMES = [124, 96, 142, 108, 132, 88];

/**
 * A ranking row with nothing in it yet, in whichever shape this width uses:
 * rank, avatar, name over a second line, XP on the right — or the five table
 * columns, at their real widths.
 */
function RankSkeleton({
  theme,
  wide,
  rows = 6,
}: {
  theme: Theme;
  wide: boolean;
  rows?: number;
}) {
  return (
    <>
      {SKEL_NAMES.slice(0, rows).map((name, index) =>
        wide ? (
          <View key={index} style={styles.tableRow}>
            <View style={{ width: COL.rank }}>
              <SkeletonBar theme={theme} width={16} height={13} />
            </View>

            <View style={[styles.studentCell, styles.flex1]}>
              <SkeletonBar theme={theme} width={AVATAR} height={AVATAR} />
              <SkeletonBar theme={theme} width={name} height={13} />
            </View>

            <View style={{ width: COL.department }}>
              <SkeletonBar theme={theme} width={index % 2 ? 120 : 152} height={12} />
            </View>
            <View style={{ width: COL.level }}>
              <SkeletonBar theme={theme} width={56} height={12} />
            </View>
            <View style={[styles.skelXpCell, { width: COL.xp }]}>
              <SkeletonBar theme={theme} width={48} height={13} />
            </View>
          </View>
        ) : (
          <View key={index} style={styles.skelRow}>
            <View style={styles.rankLead}>
              <SkeletonBar theme={theme} width={14} height={13} />
              <SkeletonBar theme={theme} width={AVATAR} height={AVATAR} />
            </View>

            <View style={styles.flex1}>
              <SkeletonBar theme={theme} width={name} height={14} />
              <SkeletonBar
                theme={theme}
                width={index % 2 ? 132 : 156}
                height={10}
                style={styles.skelSecondary}
              />
            </View>

            <SkeletonBar theme={theme} width={52} height={13} />
          </View>
        ),
      )}
    </>
  );
}

/**
 * Your own row, waiting on its own answer.
 *
 * Tinted like the real thing, because a plain grey row appearing where an
 * accented one is about to land is a colour change on arrival rather than
 * content filling in.
 */
function YouSkeleton({ theme, wide }: { theme: Theme; wide: boolean }) {
  const tint = { backgroundColor: withAlpha(theme.accent, 0.1) };

  if (wide) {
    return (
      <View style={[styles.tableRow, tint]}>
        <View style={{ width: COL.rank }}>
          <SkeletonBar theme={theme} width={22} height={13} />
        </View>
        <View style={[styles.studentCell, styles.flex1]}>
          <SkeletonBar theme={theme} width={AVATAR} height={AVATAR} />
          <SkeletonBar theme={theme} width={34} height={13} />
        </View>
        <View style={{ width: COL.department }}>
          <SkeletonBar theme={theme} width={136} height={12} />
        </View>
        <View style={{ width: COL.level }}>
          <SkeletonBar theme={theme} width={56} height={12} />
        </View>
        <View style={[styles.skelXpCell, { width: COL.xp }]}>
          <SkeletonBar theme={theme} width={48} height={13} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.skelRow, styles.skelYouRow, tint]}>
      <View style={styles.rankLead}>
        <SkeletonBar theme={theme} width={22} height={13} />
        <SkeletonBar theme={theme} width={AVATAR} height={AVATAR} />
      </View>

      <View style={styles.flex1}>
        {/* Short: this one says "You", and it always will. */}
        <SkeletonBar theme={theme} width={34} height={14} />
        <SkeletonBar theme={theme} width={148} height={10} style={styles.skelSecondary} />
      </View>

      <SkeletonBar theme={theme} width={52} height={13} />
    </View>
  );
}

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
  // --- loading placeholders ------------------------------------------------
  skelBlockTitle: {
    marginLeft: spacing.xs,
    marginBottom: spacing.sm,
  },
  skelPlinth: {
    // The real plinth pulls UP into the trophy glyph's own bearing. A solid
    // bar has no bearing to pull into, so this sits below instead.
    marginTop: spacing.xs,
  },
  skelMedalName: {
    marginTop: spacing.sm,
  },
  /** Matches Row exactly: same direction, gap and vertical padding. */
  skelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  skelYouRow: {
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.xs,
  },
  skelSecondary: {
    marginTop: spacing.xs + 2,
  },
  skelXpCell: {
    alignItems: "flex-end",
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
  // --- table (wide only) ---------------------------------------------------
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  headCell: {
    ...type.micro,
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    // Bleeds slightly wider than the row text so a highlighted row reads as a
    // band across the table rather than a floating chip.
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.xs,
  },
  cell: {
    ...type.body,
    fontWeight: weight.regular,
  },
  rankCell: {
    ...type.body,
    fontWeight: weight.semi,
  },
  studentCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  nameCell: {
    ...type.body,
    fontWeight: weight.medium,
    flexShrink: 1,
  },
  xpCell: {
    ...type.body,
    fontWeight: weight.semi,
  },
  right: {
    textAlign: "right",
  },
  flex1: {
    flex: 1,
    minWidth: 0,
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
