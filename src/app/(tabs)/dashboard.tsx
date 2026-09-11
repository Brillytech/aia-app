import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { supabase } from "../../../lib/supabase";
import { category, Theme, useThemeMode } from "../../theme";
import type { IconName } from "../../ui/alerts";
import { AnimatedSection } from "../../ui/AnimatedSection";
import { Avatar } from "../../ui/Avatar";
import { PrimaryButton } from "../../ui/Button";
import { Wordmark } from "../../ui/Wordmark";
import { haptics } from "../../ui/haptics";
import { HintBadge } from "../../ui/HintBadge";
import { FOLDER_OPEN_MS } from "../../ui/CourseFolder";
import { CourseWell } from "../../ui/CourseWell";
import { CourseRail } from "../../ui/CourseRail";
import {
  DESKTOP_MIN_WIDTH,
  useBreakpoint,
  useContentInset,
} from "../../ui/layout/breakpoints";
import { SplitPane } from "../../ui/layout/SplitPane";
import { Row, Rows } from "../../ui/Rows";
import { Stat } from "../../ui/Stat";
import { PageHeader } from "../../ui/PageHeader";
import { ProgressRing } from "../../ui/ProgressRing";
import { Screen } from "../../ui/Screen";
import { subjectColor, subjectIcon } from "../../ui/subject";
import {
  layout,
  motion as motionTokens,
  noFocusRing,
  radius,
  spacing,
  type,
  weight,
  elevation,
  withAlpha,
} from "../../ui/tokens";


type Profile = {
  username: string | null;
  full_name?: string | null;
  email: string | null;
  school: string | null;
  faculty: string | null;
  department: string | null;
  level: string | null;
  profile_completed?: boolean | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  image_url?: string | null;
};

type AssignedCourse = {
  id: string;
  code: string | null;
  title: string | null;
  semester?: string | null;
  status?: string | null;
  school?: string | null;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
  academic_period_id?: string | null;
  course_icon?: string | null;
  course_color?: string | null;
  is_shared?: boolean;
};

type Topic = {
  id: string;
  course_id: string;
  title: string;
};

type MaterialItem = {
  id: string | number;
  title: string;
  type: string | null;
  summary_1?: string | null;
  course_id?: string | null;
  topic_id?: string | null;
  courseCode: string | null;
};

type UserGoal = {
  daily_questions_goal: number;
  daily_topics_goal: number;
  daily_materials_goal: number;
};

type DailyProgress = {
  questionsAnswered: number;
  topicsCompleted: number;
  materialsOpened: number;
};

type WeeklyStats = {
  xp: number;
  learningTime: string;
  practiceAccuracy: number;
  rank: string;
};

/**
 * Width at which the dashboard becomes two columns.
 *
 * Matches profile's, and for the same reason: this screen sits behind the
 * 240px sidebar, so the usable content area is the window minus that rail.
 */
const DASHBOARD_SPLIT = 1240;

/**
 * The hero's progress bar fills on load rather than arriving already full.
 *
 * The delay is the point: the well has settled by about 700ms, so starting
 * the bar at 300 puts it in the middle of that and gives the eye an order to
 * follow — folder, then bar, then button. Starting both at zero reads as one
 * event and you notice neither.
 */
const HERO_SWEEP_DELAY = 300;
const HERO_SWEEP_MS = 900;

const DEFAULT_GOALS: UserGoal = {
  daily_questions_goal: 20,
  daily_topics_goal: 2,
  daily_materials_goal: 1,
};

/** Time-of-day greeting. This used to be the literal string "Good evening", so
 *  the app said it at 6am. Computed at render, which is often enough — the
 *  screen re-renders on mount, on pull-to-refresh and on every data load. */
function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";

  return "Good evening";
}

/**
 * Derived from the material's actual type. The old MaterialRow picked both its
 * icon and its colour from `index % 4`, so the same material changed appearance
 * depending on where it landed in the list — decoration wearing the costume of
 * data. Colour is dropped entirely here; the icon now means something.
 */
function getMaterialIcon(type?: string | null): IconName {
  const clean = String(type || "").toLowerCase();

  if (clean.includes("pdf")) return "file-pdf-box";
  if (clean.includes("video")) return "play-circle-outline";
  if (clean.includes("slide") || clean.includes("ppt")) return "presentation";
  if (clean.includes("quiz") || clean.includes("question")) return "help-circle-outline";
  if (clean.includes("note")) return "note-text-outline";
  if (clean.includes("book")) return "book-open-page-variant-outline";

  return "file-document-outline";
}

export default function Dashboard() {
  const contentInset = useContentInset();
  const { theme, isDark } = useThemeMode();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignedCourses, setAssignedCourses] = useState<AssignedCourse[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [completedTopicIds, setCompletedTopicIds] = useState<Set<string>>(
    new Set(),
  );
  const [recommendedMaterials, setRecommendedMaterials] = useState<
    MaterialItem[]
  >([]);

  const [goals, setGoals] = useState<UserGoal>(DEFAULT_GOALS);
  const [goalDraft, setGoalDraft] = useState<UserGoal>(DEFAULT_GOALS);
  const [editingGoals, setEditingGoals] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);

  const [dailyStreak, setDailyStreak] = useState(0);
  const [streakHintVisible, setStreakHintVisible] = useState(false);
  // Stable, so the badge's auto-hide timer is not restarted by every
  // unrelated re-render of this screen.
  const hideStreakHint = useCallback(() => setStreakHintVisible(false), []);

  /**
   * Opens a course — and optionally one topic inside it — on the study tab.
   *
   * The `t` nonce is load-bearing. `/study` is a tab route that stays mounted,
   * so pushing the identical courseId twice leaves its params byte-for-byte
   * unchanged, its effect deps unchanged, and the effect never re-runs. Tapping
   * the same course a second time would then do nothing at all. A per-tap
   * value makes every tap a distinct navigation.
   */
  function openInStudy(
    courseId?: string | null,
    topicId?: string | null,
    /**
     * Which study mode to land in, skipping the chooser.
     *
     * Only the Continue-learning hero passes this. Opening a topic from the
     * topic list is a "what do I want to do with this" moment and gets the
     * chooser; the hero is specifically about resuming where you stopped, so
     * putting a menu in front of it would undo what it is for. The caller
     * names the intent because only the caller knows it.
     */
    mode?: string,
  ) {
    haptics.tap();

    router.push({
      pathname: "/study",
      params: {
        courseId: courseId || "",
        topicId: topicId || "",
        mode: mode || "",
        t: String(Date.now()),
      },
    } as any);
  }
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({
    xp: 0,
    learningTime: "0m",
    practiceAccuracy: 0,
    rank: "--",
  });

  const [dailyProgress, setDailyProgress] = useState<DailyProgress>({
    questionsAnswered: 0,
    topicsCompleted: 0,
    materialsOpened: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const wide = useBreakpoint(DASHBOARD_SPLIT);
  // Not DASHBOARD_SPLIT. That one asks "is there room for two columns";
  // this asks "is this a desktop", which is what the hero's button
  // placement and the course rail's wrapping both actually depend on.
  const isDesktop = useBreakpoint(DESKTOP_MIN_WIDTH);
  // Which course is mid-open, hero included. A press lasts about 100ms and the
  // folder sequence runs 640, so navigation waits for it rather than binding
  // to the press — see CourseFolder.
  const [openingId, setOpeningId] = useState<string | null>(null);

  function openCourseWithFolder(id: string, go: () => void) {
    if (openingId) return;
    setOpeningId(id);
    setTimeout(() => {
      setOpeningId(null);
      go();
    }, FOLDER_OPEN_MS);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const studentName =
    profile?.username ||
    profile?.full_name ||
    profile?.email?.split("@")[0] ||
    "student";

  const avatarUrl =
    profile?.avatar_url || profile?.photo_url || profile?.image_url || null;

  // Catalogue-wide topic count, used only to decide whether any content
  // exists at all. Per-course progress comes from getCourseStats.
  const totalTopics = topics.length;

  const nextTopic =
    topics.find((topic) => !completedTopicIds.has(String(topic.id))) ||
    topics[0] ||
    null;
  const nextCourse = nextTopic
    ? assignedCourses.find(
        (course) => String(course.id) === String(nextTopic.course_id),
      )
    : assignedCourses[0] || null;

  const hasCourses = assignedCourses.length > 0;
  const hasContent = hasCourses && totalTopics > 0;

  const questionsPercent = percent(
    dailyProgress.questionsAnswered,
    goals.daily_questions_goal,
  );
  const topicsPercent = percent(
    dailyProgress.topicsCompleted,
    goals.daily_topics_goal,
  );
  const materialsPercent = percent(
    dailyProgress.materialsOpened,
    goals.daily_materials_goal,
  );
  const todayPercent = Math.round(
    (questionsPercent + topicsPercent + materialsPercent) / 3,
  );
  const goalsOnTrack = [
    questionsPercent,
    topicsPercent,
    materialsPercent,
  ].filter((value) => value >= 100).length;

  const metaLine = [
    profile?.school,
    profile?.department,
    formatLevel(profile?.level),
  ]
    .filter(Boolean)
    .join(" • ");

  async function loadDashboard() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      router.replace("/auth/login");
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.log("PROFILE ERROR:", profileError.message);
      setLoading(false);
      return;
    }

    if (!profileData || !profileData.profile_completed) {
      router.replace("/complete-profile");
      setLoading(false);
      return;
    }

    const nextProfile = profileData as Profile;
    setProfile(nextProfile);

    await Promise.all([
      updateDailyStreak(user.id),
      fetchUserGoals(user.id),
      fetchLearningStats(user.id),
      fetchUnreadNotifications(user.id),
      fetchDailyProgress(user.id),
      fetchLiveLearning(user.id, nextProfile),
    ]);

    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }

  function todayIsoStart() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
  }

  function getTodayDateKey() {
    return new Date().toISOString().split("T")[0];
  }

  function getYesterdayDateKey() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  }

  function getWeekStartIso(date = new Date()) {
    const current = new Date(date);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);

    current.setDate(diff);
    current.setHours(0, 0, 0, 0);

    return current.toISOString();
  }

  function getWeekStartDateKey(date = new Date()) {
    return getWeekStartIso(date).split("T")[0];
  }

  function toNumber(value: any, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function normalizePercent(value: any) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  function percent(value: number, total: number) {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
  }

  function formatDuration(seconds: number) {
    if (!seconds || seconds <= 0) return "0m";

    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
      return `${Math.max(1, minutes)}m`;
    }

    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    if (restMinutes === 0) return `${hours}h`;
    return `${hours}h ${restMinutes}m`;
  }

  function formatLevel(value?: string | null) {
    const clean = String(value || "")
      .replace(" Level", "L")
      .replace(" level", "L")
      .trim();
    return clean || "Level";
  }

  async function updateDailyStreak(userId: string) {
    const today = getTodayDateKey();
    const yesterday = getYesterdayDateKey();

    const { data, error } = await supabase
      .from("profiles")
      .select("daily_streak, last_streak_date")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.log("STREAK FETCH ERROR:", error.message);
      return;
    }

    const currentStreak = Number(data?.daily_streak || 0);
    const lastDate = data?.last_streak_date;

    if (lastDate === today) {
      setDailyStreak(currentStreak);
      return;
    }

    const nextStreak = lastDate === yesterday ? currentStreak + 1 : 1;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        daily_streak: nextStreak,
        last_streak_date: today,
      })
      .eq("id", userId);

    if (updateError) {
      console.log("STREAK UPDATE ERROR:", updateError.message);
      return;
    }

    setDailyStreak(nextStreak);
  }

  async function fetchUserGoals(userId: string) {
    const { data, error } = await supabase
      .from("user_goals")
      .select("daily_questions_goal, daily_topics_goal, daily_materials_goal")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.log("GOALS ERROR:", error.message);
      return;
    }

    const nextGoals = {
      daily_questions_goal: Math.max(
        1,
        toNumber(
          data?.daily_questions_goal,
          DEFAULT_GOALS.daily_questions_goal,
        ),
      ),
      daily_topics_goal: Math.max(
        1,
        toNumber(data?.daily_topics_goal, DEFAULT_GOALS.daily_topics_goal),
      ),
      daily_materials_goal: Math.max(
        1,
        toNumber(
          data?.daily_materials_goal,
          DEFAULT_GOALS.daily_materials_goal,
        ),
      ),
    };

    setGoals(nextGoals);
    setGoalDraft(nextGoals);
  }

  async function saveUserGoals() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) return;

    const cleanGoals = {
      daily_questions_goal: Math.max(
        1,
        toNumber(
          goalDraft.daily_questions_goal,
          DEFAULT_GOALS.daily_questions_goal,
        ),
      ),
      daily_topics_goal: Math.max(
        1,
        toNumber(goalDraft.daily_topics_goal, DEFAULT_GOALS.daily_topics_goal),
      ),
      daily_materials_goal: Math.max(
        1,
        toNumber(
          goalDraft.daily_materials_goal,
          DEFAULT_GOALS.daily_materials_goal,
        ),
      ),
    };

    setSavingGoals(true);

    const { error } = await supabase.from("user_goals").upsert(
      {
        user_id: user.id,
        ...cleanGoals,
      },
      { onConflict: "user_id" },
    );

    setSavingGoals(false);

    if (error) {
      console.log("SAVE GOALS ERROR:", error.message);
      haptics.error();
      return;
    }

    haptics.success();
    setGoals(cleanGoals);
    setGoalDraft(cleanGoals);
    setEditingGoals(false);
  }

  async function fetchLiveLearning(userId: string, studentProfile: Profile) {
    const school = studentProfile.school || "";
    const department = studentProfile.department || "";
    const level = studentProfile.level || "";
    const faculty =
      school === "LASUCOM"
        ? "College of Medicine"
        : studentProfile.faculty || "";

    if (!school || !department || !level) {
      resetLearningContent();
      return;
    }

    const { data: control, error: controlError } = await supabase
      .from("app_period_controls")
      .select("live_period_id")
      .eq("school", school)
      .eq("department", department)
      .eq("level", level)
      .maybeSingle();

    if (controlError) {
      console.log("DASHBOARD LIVE PERIOD ERROR:", controlError.message);
      resetLearningContent();
      return;
    }

    const livePeriodId = control?.live_period_id;

    if (!livePeriodId) {
      resetLearningContent();
      return;
    }

    let ownedQuery = supabase
      .from("courses")
      .select(
        "id, code, title, semester, status, school, faculty, department, level, academic_period_id, course_icon, course_color",
      )
      .eq("school", school)
      .eq("department", department)
      .eq("level", level)
      .eq("academic_period_id", livePeriodId)
      .order("created_at", { ascending: false });

    if (school === "LASU" && faculty) {
      ownedQuery = ownedQuery.eq("faculty", faculty);
    }

    const [
      { data: ownedCourses, error: ownedError },
      { data: sharedRows, error: sharedError },
    ] = await Promise.all([
      ownedQuery,
      supabase
        .from("course_shares")
        .select(
          `
            id,
            school,
            faculty,
            department,
            level,
            academic_period_id,
            courses (
              id,
              code,
              title,
              semester,
              status,
              school,
              faculty,
              department,
              level,
              academic_period_id,
              course_icon,
              course_color
            )
          `,
        )
        .eq("school", school)
        .eq("department", department)
        .eq("level", level)
        .eq("academic_period_id", livePeriodId),
    ]);

    if (ownedError)
      console.log("DASHBOARD OWNED COURSES ERROR:", ownedError.message);
    if (sharedError)
      console.log("DASHBOARD SHARED COURSES ERROR:", sharedError.message);

    const directCourses = (ownedCourses || []).map((course: any) => ({
      ...course,
      is_shared: false,
    })) as AssignedCourse[];

    const sharedCourses = (sharedRows || [])
      .map((row: any) => {
        const course = Array.isArray(row.courses)
          ? row.courses[0]
          : row.courses;
        if (!course) return null;

        return {
          ...course,
          school: row.school,
          faculty: row.faculty,
          department: row.department,
          level: row.level,
          academic_period_id: row.academic_period_id,
          is_shared: true,
        } as AssignedCourse;
      })
      .filter(Boolean) as AssignedCourse[];

    const nextCourses = Array.from(
      new Map(
        [...directCourses, ...sharedCourses].map((course) => [
          course.id,
          course,
        ]),
      ).values(),
    ).filter((course) => (course.status || "active") === "active");

    const courseIds = nextCourses.map((course) => course.id).filter(Boolean);

    if (courseIds.length === 0) {
      resetLearningContent();
      return;
    }

    const { data: topicsData, error: topicsError } = await supabase
      .from("topics")
      .select("id, course_id, title")
      .in("course_id", courseIds)
      .order("created_at", { ascending: true });

    if (topicsError)
      console.log("DASHBOARD TOPICS ERROR:", topicsError.message);

    const nextTopics = (topicsData || []) as Topic[];

    setAssignedCourses(nextCourses);
    setTopics(nextTopics);

    await Promise.all([
      fetchCompletedTopics(userId, nextTopics),
      fetchRecommendedMaterials(courseIds),
    ]);
  }

  function resetLearningContent() {
    setAssignedCourses([]);
    setTopics([]);
    setCompletedTopicIds(new Set());
    setRecommendedMaterials([]);
  }

  async function fetchCompletedTopics(userId: string, learningTopics: Topic[]) {
    if (learningTopics.length === 0) {
      setCompletedTopicIds(new Set());
      return;
    }

    const topicIds = learningTopics.map((topic) => topic.id);

    const { data, error } = await supabase
      .from("user_topic_progress")
      .select("topic_id, completed")
      .eq("user_id", userId)
      .eq("completed", true)
      .in("topic_id", topicIds);

    if (!error && data) {
      setCompletedTopicIds(
        new Set(data.map((row: any) => String(row.topic_id))),
      );
      return;
    }

    console.log("TOPIC COMPLETION ERROR:", error?.message);

    const fallback = await supabase
      .from("user_progress")
      .select("topic_id, progress_percent, progress, percent")
      .eq("user_id", userId)
      .in("topic_id", topicIds);

    if (!fallback.error && fallback.data) {
      const completed = fallback.data
        .filter(
          (row: any) =>
            normalizePercent(
              row.progress_percent || row.progress || row.percent,
            ) >= 100,
        )
        .map((row: any) => String(row.topic_id));

      setCompletedTopicIds(new Set(completed));
      return;
    }

    setCompletedTopicIds(new Set());
  }

  async function fetchRecommendedMaterials(courseIds: string[]) {
    if (courseIds.length === 0) {
      setRecommendedMaterials([]);
      return;
    }

    const { data, error } = await supabase
      .from("materials")
      .select(
        `
        id,
        title,
        type,
        summary_1,
        course_id,
        topic_id,
        courses (
          code,
          title
        )
      `,
      )
      .in("course_id", courseIds)
      .order("created_at", { ascending: false })
      .limit(2);

    if (error) {
      console.log("RECOMMENDED MATERIALS ERROR:", error.message);
      setRecommendedMaterials([]);
      return;
    }

    const nextMaterials =
      data?.map((item: any) => ({
        id: item.id,
        title: item.title || "Study material",
        type: item.type || "Material",
        summary_1: item.summary_1 || null,
        course_id: item.course_id,
        topic_id: item.topic_id,
        courseCode: item.courses?.code || item.courses?.title || null,
      })) || [];

    setRecommendedMaterials(nextMaterials);
  }

  async function fetchDailyProgress(userId: string) {
    const start = todayIsoStart();

    const [
      practiceAnswers,
      practiceAttempts,
      examAnswers,
      examAttempts,
      topicProgress,
      progressRows,
    ] = await Promise.all([
      // Only rows the student actually answered. Practice and exam insert a
      // row for EVERY question in the session (selected_answer null when
      // skipped), so an unfiltered count reported the session size — pick
      // 100 questions, answer none, submit, and the daily goal moved by 100.
      supabase
        .from("practice_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("selected_answer", "is", null)
        .gte("created_at", start),
      // correct + wrong, not total_questions — the fallback had the same
      // session-size problem as the primary path.
      supabase
        .from("practice_attempts")
        .select("correct_answers, wrong_answers")
        .eq("user_id", userId)
        .gte("created_at", start),
      supabase
        .from("exam_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("selected_answer", "is", null)
        .gte("created_at", start),
      supabase
        .from("exam_attempts")
        .select("correct_answers, wrong_answers")
        .eq("user_id", userId)
        .gte("created_at", start),
      supabase
        .from("user_topic_progress")
        .select("topic_id")
        .eq("user_id", userId)
        .eq("completed", true)
        .gte("completed_at", start),
      supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", userId)
        .gte("updated_at", start)
        .limit(200),
    ]);

    let questionsAnswered = 0;

    if (!practiceAnswers.error && typeof practiceAnswers.count === "number") {
      questionsAnswered += practiceAnswers.count;
    } else if (!practiceAttempts.error && practiceAttempts.data) {
      questionsAnswered += practiceAttempts.data.reduce(
        (sum: number, row: any) =>
          sum + toNumber(row.correct_answers, 0) + toNumber(row.wrong_answers, 0),
        0,
      );
    }

    if (!examAnswers.error && typeof examAnswers.count === "number") {
      questionsAnswered += examAnswers.count;
    } else if (!examAttempts.error && examAttempts.data) {
      questionsAnswered += examAttempts.data.reduce(
        (sum: number, row: any) =>
          sum + toNumber(row.correct_answers, 0) + toNumber(row.wrong_answers, 0),
        0,
      );
    }

    let topicsCompleted = 0;

    if (!topicProgress.error && topicProgress.data) {
      topicsCompleted = new Set(
        topicProgress.data.map((row: any) => String(row.topic_id)),
      ).size;
    } else if (!progressRows.error && progressRows.data) {
      topicsCompleted = new Set(
        progressRows.data
          .filter(
            (row: any) =>
              normalizePercent(
                row.progress_percent || row.progress || row.percent,
              ) >= 100,
          )
          .map((row: any) => String(row.topic_id)),
      ).size;
    }

    let materialsOpened = 0;

    if (!progressRows.error && progressRows.data) {
      const openedMaterialIds = new Set<string>();

      progressRows.data.forEach((row: any) => {
        questionsAnswered += toNumber(
          row.questions_studied ||
            row.questions_answered ||
            row.answered_questions,
          0,
        );

        if (row.material_id) openedMaterialIds.add(String(row.material_id));
        else if (row.content_id) openedMaterialIds.add(String(row.content_id));
        else if (row.materials_opened)
          openedMaterialIds.add(`opened-${row.topic_id || row.id}`);
      });

      // The distinct-id set is the honest number when the rows carry one.
      // Falling back to the summed counter only when no ids are present —
      // the old Math.max let the raw sum win whenever it was larger, which
      // is exactly the reopen inflation this is meant to avoid.
      materialsOpened =
        openedMaterialIds.size > 0
          ? openedMaterialIds.size
          : progressRows.data.reduce(
              (sum: number, row: any) => sum + toNumber(row.materials_opened, 0),
              0,
            );
    }

    setDailyProgress({
      questionsAnswered,
      topicsCompleted,
      materialsOpened,
    });
  }

  async function fetchLearningStats(userId: string) {
    const weekStart = getWeekStartIso();
    const weekStartDate = getWeekStartDateKey();

    const [xpResult, activityResult, practiceResult] = await Promise.all([
      supabase
        .from("xp_events")
        .select("user_id, xp")
        .gte("week_start", weekStartDate),
      supabase
        .from("user_activity_logs")
        .select(
          "mode, duration_seconds, accuracy_percent, created_at, week_start",
        )
        .eq("user_id", userId)
        .in("mode", ["study", "practice", "exam"])
        .gte("created_at", weekStart),
      supabase
        .from("practice_attempts")
        .select("score_percent")
        .eq("user_id", userId)
        .gte("created_at", weekStart),
    ]);

    let weeklyXp = 0;
    let rank = "--";

    if (!xpResult.error && xpResult.data) {
      const xpByUser = new Map<string, number>();

      xpResult.data.forEach((row: any) => {
        const key = row.user_id || "unknown";
        const nextValue = (xpByUser.get(key) || 0) + toNumber(row.xp, 0);
        xpByUser.set(key, nextValue);
      });

      weeklyXp = xpByUser.get(userId) || 0;

      const sorted = Array.from(xpByUser.entries()).sort((a, b) => b[1] - a[1]);
      const index = sorted.findIndex(([id]) => id === userId);

      rank = index >= 0 ? `#${index + 1}` : "--";
    } else {
      console.log("WEEKLY XP ERROR:", xpResult.error?.message);
    }

    let totalSeconds = 0;
    const practiceAccuracyFromLogs: number[] = [];

    if (!activityResult.error && activityResult.data) {
      activityResult.data.forEach((row: any) => {
        totalSeconds += toNumber(row.duration_seconds, 0);

        if (row.mode === "practice" && row.accuracy_percent !== null) {
          practiceAccuracyFromLogs.push(normalizePercent(row.accuracy_percent));
        }
      });
    } else {
      console.log("WEEKLY ACTIVITY ERROR:", activityResult.error?.message);
    }

    let practiceAccuracy = 0;

    if (practiceAccuracyFromLogs.length > 0) {
      practiceAccuracy = Math.round(
        practiceAccuracyFromLogs.reduce((sum, value) => sum + value, 0) /
          practiceAccuracyFromLogs.length,
      );
    } else if (
      !practiceResult.error &&
      practiceResult.data &&
      practiceResult.data.length > 0
    ) {
      practiceAccuracy = Math.round(
        practiceResult.data.reduce(
          (sum: number, row: any) => sum + normalizePercent(row.score_percent),
          0,
        ) / practiceResult.data.length,
      );
    }

    setWeeklyStats({
      xp: weeklyXp,
      learningTime: formatDuration(totalSeconds),
      practiceAccuracy,
      rank,
    });
  }

  async function fetchUnreadNotifications(userId: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq("is_read", false);

    if (error) {
      console.log("UNREAD NOTIFICATIONS ERROR:", error.message);
      setUnreadNotifications(0);
      return;
    }

    setUnreadNotifications(count || 0);
  }

  function getCourseStats(courseId: string) {
    const courseTopics = topics.filter(
      (topic) => String(topic.course_id) === String(courseId),
    );
    const done = courseTopics.filter((topic) =>
      completedTopicIds.has(String(topic.id)),
    ).length;
    const total = courseTopics.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    return { done, total, progress };
  }

  const courseAccent = subjectColor(nextCourse, 0);

  // Scoped to the course this card is actually about. It used to show
  // catalogue-wide progress while sitting under one course's title and topic,
  // which read as that course being further along than it was.
  const continueStats = nextCourse ? getCourseStats(nextCourse.id) : null;

  // Driven by a shared value rather than a CSS width transition, because a
  // transition has no previous value to animate from on first paint — it
  // would simply appear at its final width. This covers later updates too,
  // which is why the old transitionProperty is gone rather than kept
  // alongside it; two systems animating one width is how you get a stutter.
  const heroProgress = useSharedValue(0);

  useEffect(() => {
    heroProgress.value = withDelay(
      HERO_SWEEP_DELAY,
      withTiming(continueStats?.progress ?? 0, {
        duration: HERO_SWEEP_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [continueStats?.progress, heroProgress]);

  const heroFillStyle = useAnimatedStyle(() => ({
    width: `${heroProgress.value}%`,
  }));

  // Everything the hero needs except its handler, so the two branches below
  // spread one object instead of repeating a dozen props each. The handler
  // stays in JSX at each call site deliberately — see the note on
  // ContinueHero for why it must not move into here.
  const heroProps = {
    theme,
    dark: isDark,
    color: courseAccent,
    icon: subjectIcon(nextCourse),
    title:
      nextCourse?.title || (hasCourses ? "Topics coming soon" : "Learning starts soon"),
    topic:
      nextTopic?.title ||
      (hasCourses
        ? "Your course content will appear here."
        : "Your courses will appear once setup is ready."),
    counts:
      continueStats && continueStats.total > 0
        ? `${continueStats.done} of ${continueStats.total} topics`
        : null,
    percent: continueStats?.progress ?? 0,
    inlineCta: isDesktop,
    opening: openingId === (nextCourse?.id ? String(nextCourse.id) : "hero"),
    fillStyle: heroFillStyle,
  };

  // Flattened for the rail, which takes plain data rather than reaching back
  // into this screen's course/topic/progress state.
  const railCourses = assignedCourses.map((course, index) => {
    const stats = getCourseStats(course.id);

    return {
      id: String(course.id),
      code: course.code || course.title || "Course",
      title: course.title || "",
      progress: stats.progress,
      done: stats.done,
      total: stats.total,
      color: subjectColor(course, index),
      icon: subjectIcon(course),
    };
  });

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        contentContainerStyle={[styles.scroll, contentInset]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
          />
        }
        // Pinned: live status and the two most-used routes. Not a title —
        // "Good evening, Ade" is a greeting, and a greeting is meaningless
        // once you have scrolled past it.
        bar={
          <>
            {/* Name left, actions right — the shape every app header takes.
                The avatar moved from the left slot into the action group to
                make room, which also puts every tappable thing in the bar on
                one side instead of splitting them across both. Text-only:
                the avatar's fallback is this same logo.

                The two lines measure 38pt against the bar's 44, so the brand
                fits without changing the bar's height or touching anything
                below it. */}
            <Wordmark theme={theme} compact brand showLogo={false} />

            <View style={styles.barStatus}>
              {dailyStreak > 0 ? (
                // Tappable purely so the flame can explain itself. A number
                // next to an icon with no label is a thing people poke at to
                // find out what it is; this rewards that instead of ignoring
                // it. Nothing navigates — the badge says its name and goes.
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    setStreakHintVisible(true);
                  }}
                  hitSlop={8}
                  style={[styles.streak, { backgroundColor: theme.accentSoft }]}
                >
                  <MaterialCommunityIcons
                    name="fire"
                    size={15}
                    color={theme.accent}
                  />
                  <Text style={[styles.streakText, { color: theme.accent }]}>
                    {dailyStreak}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  haptics.tap();
                  router.push("/leaderboard" as any);
                }}
                hitSlop={10}
                style={[styles.barIcon, { backgroundColor: theme.soft }]}
              >
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={20}
                  color={theme.text}
                />
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.tap();
                  router.push("/notifications" as any);
                }}
                hitSlop={10}
                style={[styles.barIcon, { backgroundColor: theme.soft }]}
              >
                <MaterialCommunityIcons
                  name="bell-outline"
                  size={20}
                  color={theme.text}
                />

                {unreadNotifications > 0 ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.accent, borderColor: theme.bg },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: theme.onAccent }]}>
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.tap();
                  router.push("/profile" as any);
                }}
                hitSlop={10}
              >
                {/* Initials, not the app's logo. The mark already sits in this
                    same bar on the left, and a brand mark in the slot that means
                    "you" says the account belongs to the app. */}
                <Avatar
                  theme={theme}
                  uri={avatarUrl}
                  name={studentName}
                  size={AVATAR}
                />
              </Pressable>
            </View>
          </>
        }
        intro={
          // The whole block routes to profile, not just the 32px avatar — a
          // labelled target is what makes the route discoverable once Profile
          // is no longer a tab.
          <Pressable
            onPress={() => {
              haptics.tap();
              router.push("/profile" as any);
            }}
            style={styles.greetingRow}
          >
            <View style={styles.flex1}>
              <Text
                style={[styles.greeting, { color: theme.text }]}
                numberOfLines={1}
              >
                {getGreeting()}, {studentName}
              </Text>
              <Text
                style={[styles.greetingMeta, { color: theme.muted }]}
                numberOfLines={1}
              >
                {/* Was "LASU Scholar", which now sits in the bar directly
                    above — a profile line should say who you are, not repeat
                    the app's name back at you. */}
                {metaLine || "Complete your profile"}
              </Text>
            </View>

            {/* Without this the block is just text — nothing signals it taps. */}
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.muted}
            />
          </Pressable>
        }
      >
        {/* A surface of its own, toned in the course's colour rather than the
            neutral card the lists use. Bare-on-page made it lighter than the
            goals card below it, so the hero read as the weakest thing on the
            screen; a tinted panel gives it weight without making it a peer of
            the neutral cards. */}
        {wide ? (
          <SplitPane
            theme={theme}
            // Main is what you act on; the rail is what you check. Recommended
            // is a link you follow, so it belongs with the actions, while the
            // stats are read and left alone.
            side="end"
            railWidth={320}
            divider={false}
            rail={
              <View>
                <AnimatedSection index={1}>
                  <View style={styles.goalsBlock}>
                    <View style={styles.blockHeader}>
                      <Text style={[styles.blockTitle, { color: theme.muted }]}>
                        Today&apos;s goals
                      </Text>

                      <Pressable
                        onPress={() => {
                          haptics.tap();
                          setGoalDraft(goals);
                          setEditingGoals(!editingGoals);
                        }}
                        hitSlop={10}
                        style={styles.blockAction}
                      >
                        <Text style={[styles.blockActionText, { color: theme.accent }]}>
                          {editingGoals ? "Cancel" : "Edit"}
                        </Text>
                      </Pressable>
                    </View>

                    {editingGoals ? (
                      <View style={styles.goalEditBox}>
                        <GoalInput
                          theme={theme}
                          label="Questions per day"
                          value={goalDraft.daily_questions_goal}
                          onChange={(value) =>
                            setGoalDraft((prev) => ({
                              ...prev,
                              daily_questions_goal: value,
                            }))
                          }
                        />

                        <GoalInput
                          theme={theme}
                          label="Topics per day"
                          value={goalDraft.daily_topics_goal}
                          onChange={(value) =>
                            setGoalDraft((prev) => ({
                              ...prev,
                              daily_topics_goal: value,
                            }))
                          }
                        />

                        <GoalInput
                          theme={theme}
                          label="Materials per day"
                          value={goalDraft.daily_materials_goal}
                          onChange={(value) =>
                            setGoalDraft((prev) => ({
                              ...prev,
                              daily_materials_goal: value,
                            }))
                          }
                        />

                        <PrimaryButton
                          label={savingGoals ? "Saving..." : "Save goals"}
                          onPress={saveUserGoals}
                          disabled={savingGoals}
                          color={theme.accent}
                          textColor={theme.onAccent}
                        />
                      </View>
                    ) : (
                      <View style={styles.goalsBody}>
                        {/* The ring is the day in one number and the bars break it
                            down — pairing them side by side is the structure the card
                            was providing, minus the box. */}
                        <ProgressRing
                          percent={todayPercent}
                          size={88}
                          strokeWidth={8}
                          trackColor={theme.soft}
                          progressColor={theme.accent}
                          textColor={theme.text}
                          label="today"
                        />

                        <View style={styles.goalRows}>
                          <GoalProgressRow
                            theme={theme}
                            label="Questions"
                            value={`${dailyProgress.questionsAnswered} / ${goals.daily_questions_goal}`}
                            percent={questionsPercent}
                            color={category.orange}
                          />
                          <GoalProgressRow
                            theme={theme}
                            label="Topics"
                            value={`${dailyProgress.topicsCompleted} / ${goals.daily_topics_goal}`}
                            percent={topicsPercent}
                            color={category.blue}
                          />
                          <GoalProgressRow
                            theme={theme}
                            label="Materials"
                            value={`${dailyProgress.materialsOpened} / ${goals.daily_materials_goal}`}
                            percent={materialsPercent}
                            color={category.green}
                          />
                        </View>
                      </View>
                    )}

                    {editingGoals ? null : (
                      <Text style={[styles.goalStatus, { color: theme.muted }]}>
                        {goalsOnTrack} of 3 on track
                      </Text>
                    )}
                  </View>
                </AnimatedSection>
                <AnimatedSection index={4}>
                  <View style={styles.weekBlock}>
                    {/* The Rank stat below is the leaderboard's number, so the link
                        lands exactly where the value came from. */}
                    <View style={styles.blockHeader}>
                      <Text style={[styles.blockTitle, { color: theme.muted }]}>
                        This week
                      </Text>

                      <Pressable
                        onPress={() => {
                          haptics.tap();
                          router.push("/leaderboard" as any);
                        }}
                        hitSlop={10}
                        style={styles.blockAction}
                      >
                        <Text style={[styles.blockActionText, { color: theme.accent }]}>
                          Leaderboard
                        </Text>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={16}
                          color={theme.accent}
                        />
                      </Pressable>
                    </View>

                    {/* Two-by-two rather than four across. In one row each lane was
                        ~80px wide, which forced the values down to 22px and the labels
                        down to one word ("Time", "Rank"). Half-width lanes let the
                        numbers get big and the labels say what they mean. */}
                    <View style={styles.weekGrid}>
                        <View style={styles.weekCell}>
                          <Stat theme={theme} size="major" value={weeklyStats.learningTime} label="Learning time" />
                        </View>
                        <View style={styles.weekCell}>
                          <Stat theme={theme} size="major" value={`${weeklyStats.practiceAccuracy}%`} label="Practice accuracy" />
                        </View>
                        <View style={styles.weekCell}>
                          <Stat theme={theme} size="major" value={String(weeklyStats.xp)} label="XP earned" />
                        </View>
                        <View style={styles.weekCell}>
                          <Stat theme={theme} size="major" value={weeklyStats.rank} label="Leaderboard rank" />
                        </View>
                      </View>
                  </View>
                </AnimatedSection>
              </View>
            }
          >
            <ContinueHero
              {...heroProps}
              onPress={() =>
                openCourseWithFolder(nextCourse?.id ? String(nextCourse.id) : "hero", () =>
                  hasContent && nextTopic
                    ? openInStudy(nextTopic.course_id, nextTopic.id, "questions")
                    : router.push("/study" as any),
                )
              }
            />
            <AnimatedSection index={2}>
              <View style={styles.coursesBlock}>
                <View style={[styles.blockHeader, styles.coursesHeader]}>
                  <Text style={[styles.blockTitle, { color: theme.muted }]}>Courses</Text>

                  {assignedCourses.length > 0 ? (
                    <Pressable
                      onPress={() => {
                        haptics.tap();
                        router.push("/study" as any);
                      }}
                      hitSlop={10}
                      style={styles.blockAction}
                    >
                      <Text style={[styles.blockActionText, { color: theme.accent }]}>
                        See all
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {assignedCourses.length === 0 ? (
                  <Text style={[styles.coursesEmpty, { color: theme.muted }]}>
                    No courses yet
                  </Text>
                ) : (
                  // Rings, not tiles. This is a dashboard: the question it answers is
                  // "which course am I furthest behind on", and a sweep answers that at
                  // a glance. A tile answers "which course is this", which is the study
                  // library's job — running both meant the two screens showed the same
                  // object and the dashboard read as a second copy of the library.
                  //
                  // It is also about a fifth of the height: the whole catalogue fits in
                  // roughly 105px, where the tile grid spent that on every two courses.
                  <CourseRail
                    theme={theme}
                    courses={railCourses}
                    onPressCourse={openInStudy}
                    wrap={isDesktop}
                  />
                )}
              </View>
            </AnimatedSection>
            <AnimatedSection index={3}>
              {/* No "See all". These are simply the newest materials in your
                  courses, so there is no fuller list of *recommendations* to send
                  anyone to — the destination would just be the study page they can
                  already reach from the tab bar. Two rows, and they stand alone. */}
              {/* `plain`: two rows sitting between two bare blocks did not need a
                  card and a shadow of their own. Dividers still separate them —
                  only the surface goes — which leaves Account as the one card on
                  this screen, and it reads as deliberate rather than as the
                  default treatment. */}
              <Rows theme={theme} title="Recommended">
                {recommendedMaterials.length === 0 ? (
                  <Row
                    theme={theme}
                    icon="file-search-outline"
                    label={
                      assignedCourses.length === 0
                        ? "No recommendations yet"
                        : "No materials yet"
                    }
                    chevron={false}
                  />
                ) : (
                  recommendedMaterials.slice(0, 2).map((item) => (
                    <Row
                      key={String(item.id)}
                      theme={theme}
                      icon={getMaterialIcon(item.type)}
                      label={item.title || "Material"}
                      value={item.courseCode || undefined}
                      secondary={item.summary_1 || undefined}
                      onPress={() => openInStudy(item.course_id, item.topic_id)}
                    />
                  ))
                )}
              </Rows>
            </AnimatedSection>
          </SplitPane>
        ) : (
          <>
<ContinueHero
  {...heroProps}
  onPress={() =>
    openCourseWithFolder(nextCourse?.id ? String(nextCourse.id) : "hero", () =>
      hasContent && nextTopic
        ? openInStudy(nextTopic.course_id, nextTopic.id, "questions")
        : router.push("/study" as any),
    )
  }
/>

<AnimatedSection index={1}>
          <View style={styles.coursesBlock}>
            <View style={[styles.blockHeader, styles.coursesHeader]}>
              <Text style={[styles.blockTitle, { color: theme.muted }]}>Courses</Text>

              {assignedCourses.length > 0 ? (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    router.push("/study" as any);
                  }}
                  hitSlop={10}
                  style={styles.blockAction}
                >
                  <Text style={[styles.blockActionText, { color: theme.accent }]}>
                    See all
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {assignedCourses.length === 0 ? (
              <Text style={[styles.coursesEmpty, { color: theme.muted }]}>
                No courses yet
              </Text>
            ) : (
              // Rings, not tiles. This is a dashboard: the question it answers is
              // "which course am I furthest behind on", and a sweep answers that at
              // a glance. A tile answers "which course is this", which is the study
              // library's job — running both meant the two screens showed the same
              // object and the dashboard read as a second copy of the library.
              //
              // It is also about a fifth of the height: the whole catalogue fits in
              // roughly 105px, where the tile grid spent that on every two courses.
              <CourseRail
                theme={theme}
                courses={railCourses}
                onPressCourse={openInStudy}
                wrap={isDesktop}
              />
            )}
          </View>
        </AnimatedSection>

<AnimatedSection index={2}>
          <View style={styles.goalsBlock}>
            <View style={styles.blockHeader}>
              <Text style={[styles.blockTitle, { color: theme.muted }]}>
                Today&apos;s goals
              </Text>

              <Pressable
                onPress={() => {
                  haptics.tap();
                  setGoalDraft(goals);
                  setEditingGoals(!editingGoals);
                }}
                hitSlop={10}
                style={styles.blockAction}
              >
                <Text style={[styles.blockActionText, { color: theme.accent }]}>
                  {editingGoals ? "Cancel" : "Edit"}
                </Text>
              </Pressable>
            </View>

            {editingGoals ? (
              <View style={styles.goalEditBox}>
                <GoalInput
                  theme={theme}
                  label="Questions per day"
                  value={goalDraft.daily_questions_goal}
                  onChange={(value) =>
                    setGoalDraft((prev) => ({
                      ...prev,
                      daily_questions_goal: value,
                    }))
                  }
                />

                <GoalInput
                  theme={theme}
                  label="Topics per day"
                  value={goalDraft.daily_topics_goal}
                  onChange={(value) =>
                    setGoalDraft((prev) => ({
                      ...prev,
                      daily_topics_goal: value,
                    }))
                  }
                />

                <GoalInput
                  theme={theme}
                  label="Materials per day"
                  value={goalDraft.daily_materials_goal}
                  onChange={(value) =>
                    setGoalDraft((prev) => ({
                      ...prev,
                      daily_materials_goal: value,
                    }))
                  }
                />

                <PrimaryButton
                  label={savingGoals ? "Saving..." : "Save goals"}
                  onPress={saveUserGoals}
                  disabled={savingGoals}
                  color={theme.accent}
                  textColor={theme.onAccent}
                />
              </View>
            ) : (
              <View style={styles.goalsBody}>
                {/* The ring is the day in one number and the bars break it
                    down — pairing them side by side is the structure the card
                    was providing, minus the box. */}
                <ProgressRing
                  percent={todayPercent}
                  size={88}
                  strokeWidth={8}
                  trackColor={theme.soft}
                  progressColor={theme.accent}
                  textColor={theme.text}
                  label="today"
                />

                <View style={styles.goalRows}>
                  <GoalProgressRow
                    theme={theme}
                    label="Questions"
                    value={`${dailyProgress.questionsAnswered} / ${goals.daily_questions_goal}`}
                    percent={questionsPercent}
                    color={category.orange}
                  />
                  <GoalProgressRow
                    theme={theme}
                    label="Topics"
                    value={`${dailyProgress.topicsCompleted} / ${goals.daily_topics_goal}`}
                    percent={topicsPercent}
                    color={category.blue}
                  />
                  <GoalProgressRow
                    theme={theme}
                    label="Materials"
                    value={`${dailyProgress.materialsOpened} / ${goals.daily_materials_goal}`}
                    percent={materialsPercent}
                    color={category.green}
                  />
                </View>
              </View>
            )}

            {editingGoals ? null : (
              <Text style={[styles.goalStatus, { color: theme.muted }]}>
                {goalsOnTrack} of 3 on track
              </Text>
            )}
          </View>
        </AnimatedSection>

<AnimatedSection index={3}>
          {/* No "See all". These are simply the newest materials in your
              courses, so there is no fuller list of *recommendations* to send
              anyone to — the destination would just be the study page they can
              already reach from the tab bar. Two rows, and they stand alone. */}
          {/* `plain`: two rows sitting between two bare blocks did not need a
              card and a shadow of their own. Dividers still separate them —
              only the surface goes — which leaves Account as the one card on
              this screen, and it reads as deliberate rather than as the
              default treatment. */}
          <Rows theme={theme} title="Recommended">
            {recommendedMaterials.length === 0 ? (
              <Row
                theme={theme}
                icon="file-search-outline"
                label={
                  assignedCourses.length === 0
                    ? "No recommendations yet"
                    : "No materials yet"
                }
                chevron={false}
              />
            ) : (
              recommendedMaterials.slice(0, 2).map((item) => (
                <Row
                  key={String(item.id)}
                  theme={theme}
                  icon={getMaterialIcon(item.type)}
                  label={item.title || "Material"}
                  value={item.courseCode || undefined}
                  secondary={item.summary_1 || undefined}
                  onPress={() => openInStudy(item.course_id, item.topic_id)}
                />
              ))
            )}
          </Rows>
        </AnimatedSection>

<AnimatedSection index={4}>
          <View style={styles.weekBlock}>
            {/* The Rank stat below is the leaderboard's number, so the link
                lands exactly where the value came from. */}
            <View style={styles.blockHeader}>
              <Text style={[styles.blockTitle, { color: theme.muted }]}>
                This week
              </Text>

              <Pressable
                onPress={() => {
                  haptics.tap();
                  router.push("/leaderboard" as any);
                }}
                hitSlop={10}
                style={styles.blockAction}
              >
                <Text style={[styles.blockActionText, { color: theme.accent }]}>
                  Leaderboard
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color={theme.accent}
                />
              </Pressable>
            </View>

            {/* Two-by-two rather than four across. In one row each lane was
                ~80px wide, which forced the values down to 22px and the labels
                down to one word ("Time", "Rank"). Half-width lanes let the
                numbers get big and the labels say what they mean. */}
            <View style={styles.weekGrid}>
                <View style={styles.weekCell}>
                  <Stat theme={theme} size="major" value={weeklyStats.learningTime} label="Learning time" />
                </View>
                <View style={styles.weekCell}>
                  <Stat theme={theme} size="major" value={`${weeklyStats.practiceAccuracy}%`} label="Practice accuracy" />
                </View>
                <View style={styles.weekCell}>
                  <Stat theme={theme} size="major" value={String(weeklyStats.xp)} label="XP earned" />
                </View>
                <View style={styles.weekCell}>
                  <Stat theme={theme} size="major" value={weeklyStats.rank} label="Leaderboard rank" />
                </View>
              </View>
          </View>
        </AnimatedSection>

<AnimatedSection index={5}>
          <Rows theme={theme} title="Account">
            <Row
              theme={theme}
              icon="account-circle-outline"
              label="Profile"
              onPress={() => router.push("/profile" as any)}
            />

            <Row
              theme={theme}
              icon="cog-outline"
              label="Settings"
              onPress={() => router.push("/settings" as any)}
            />
          </Rows>
        </AnimatedSection>
          </>
        )}
      </PageHeader>

      {loading ? (
        <View
          style={[styles.loadingOverlay, { backgroundColor: theme.overlay }]}
        >
          <ActivityIndicator color={theme.onAccent} />
        </View>
      ) : null}

      <HintBadge
        theme={theme}
        visible={streakHintVisible}
        icon="fire"
        label="Daily streak"
        detail={dailyStreak === 1 ? "1 day" : `${dailyStreak} days`}
        onHide={hideStreakHint}
      />
    </Screen>
  );
}

function GoalInput({
  theme,
  label,
  value,
  onChange,
}: {
  theme: Theme;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.goalEditRow}>
      <Text style={[styles.goalEditLabel, { color: theme.muted }]}>{label}</Text>

      <TextInput
        keyboardType="numeric"
        value={String(value)}
        onChangeText={(text) => onChange(Number(text.replace(/[^0-9]/g, "")) || 0)}
        style={[
          styles.goalInput,
          noFocusRing,
          {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.input,
          },
        ]}
      />
    </View>
  );
}

function GoalProgressRow({
  theme,
  label,
  value,
  percent,
  color,
}: {
  theme: Theme;
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  const cleanPercent = Math.max(0, Math.min(100, percent));

  return (
    <View>
      <View style={styles.goalLineTop}>
        <Text style={[styles.goalRowLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.goalRowValue, { color: theme.muted }]}>{value}</Text>
      </View>

      <View style={[styles.track, styles.goalTrack, { backgroundColor: theme.soft }]}>
        <View
          style={[
            styles.fill,
            { width: `${cleanPercent}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}


/**
 * Continue learning.
 *
 * A component rather than a render function inside Dashboard, and rather
 * than markup duplicated across the wide and narrow branches. Two reasons,
 * one of them not obvious:
 *
 *   1. It is the most detailed block on the screen. The rest of Dashboard
 *      duplicates its sections across the two width branches, which is
 *      survivable for a heading and a list and is not survivable here.
 *
 *   2. As a render function it tripped the React Compiler's purity rule.
 *      The analyser followed it -> its onPress closure -> openInStudy ->
 *      Date.now() and called it an impure call during render. The nonce is
 *      load-bearing (see openInStudy) and the closure really is an event
 *      handler, so neither could change. Passing onPress in from JSX puts
 *      the arrow back where every other handler on this screen lives.
 *      KEEP IT THERE — moving it into heroProps brings the error back,
 *      because an object literal built during render is not a recognised
 *      handler position.
 *
 * HEIGHT IS A FEATURE HERE
 * ------------------------
 * An earlier pass had the folder in a 108px well, a 28px display title on
 * its own row below, an eyebrow above it and a stacked button — about
 * 415px, which pushed the course rings off the first screen on a phone.
 * The rings are the thing a student opens this screen to see. So: no
 * eyebrow, an 84px well, and the title beside the well rather than under
 * it. Roughly 235px, and what makes it read as the primary object is
 * unchanged — the well, the fold, and the fact that it is the one
 * borderless surface on the screen.
 *
 * Nothing here reaches into data: every value arrives as a prop.
 */
function ContinueHero({
  theme,
  dark,
  color,
  icon,
  title,
  topic,
  counts,
  percent,
  inlineCta,
  opening,
  fillStyle,
  onPress,
}: {
  theme: Theme;
  dark: boolean;
  color: string;
  icon: IconName;
  title: string;
  topic: string;
  /** "6 of 9 topics", or null when the course has no topics yet. Shown
   *  beside the percentage only where there is room for it. */
  counts: string | null;
  percent: number;
  /** At or above 1024 the button joins the footer row; below, it stacks. */
  inlineCta: boolean;
  opening: boolean;
  /** The animated fill width. Owned by the screen so it survives re-renders. */
  fillStyle: React.ComponentProps<typeof Reanimated.View>["style"];
  onPress: () => void;
}) {
  const cta = (
    <View
      style={[
        styles.continueCta,
        inlineCta ? null : styles.continueCtaBlock,
        { backgroundColor: theme.accent },
      ]}
    >
      <Text style={[styles.continueCtaText, { color: theme.onAccent }]}>Continue</Text>

      {/* The arrow in its own chip reads as "go" rather than as decoration
          trailing the word. */}
      <View style={[styles.continueCtaChip, { backgroundColor: withAlpha(theme.onAccent, 0.2) }]}>
        <MaterialCommunityIcons name="arrow-right" size={15} color={theme.onAccent} />
      </View>
    </View>
  );

  return (
    <AnimatedSection index={0}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }: any) => [
          styles.continueBlock,
          {
            // Neutral. The hue lives in the well and on the dot; the card
            // itself carries none of it.
            backgroundColor: theme.card,
            // ELEVATION EXCEPTION, DELIBERATE, and one step past the course
            // tiles. They rest at 2 and hover at 3; this rests at 3 and hovers
            // at 4, which is what lets it read as the primary object with no
            // border and no colour. Nothing else may reach for level 4.
            ...elevation(hovered && !pressed ? 4 : 3, theme.shadow),
            transform: [
              { translateY: hovered && !pressed ? -2 : 0 },
              { scale: pressed ? 0.985 : 1 },
            ],
            transitionProperty: "transform, box-shadow",
            transitionDuration: motionTokens.fast,
          },
        ]}
      >
        <View style={styles.heroTop}>
          <CourseWell
            color={color}
            icon={icon}
            dark={dark}
            open={opening}
            size={84}
            folderSize={58}
          />

          {/* Beside the well at every width. Stacking it below was what made
              the card tall, and it bought nothing: with the button out of
              this row the title already has about 210px on a phone, which is
              enough to wrap on whole words. */}
          <View style={styles.flex1}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>{title}</Text>

            <View style={styles.heroTopicRow}>
              {/* The hue as a marker: seven pixels saying which course this
                  topic belongs to, rather than a panel tinted with it. */}
              <View style={[styles.heroDot, { backgroundColor: color }]} />
              <Text style={[styles.heroTopic, { color: theme.text }]}>{topic}</Text>
            </View>
          </View>
        </View>

        {/* Full bleed to the padding edge. A rule that stops short of the edges
            reads as a divider between two lists; one that runs the whole width
            reads as a fold, which is the point. */}
        <View style={[styles.heroRule, { backgroundColor: theme.border }]} />

        <View style={styles.heroFoot}>
          <View style={[styles.track, styles.heroTrack, { backgroundColor: theme.soft }]}>
            <Reanimated.View
              style={[
                styles.fill,
                // Progress toward your own goal, so it takes the brand accent
                // rather than the course's colour.
                { backgroundColor: theme.accent },
                fillStyle,
              ]}
            />
          </View>

          {/* On the bar's line rather than under it: a second row here cost
              22px to say what four characters say. */}
          <Text style={[styles.heroPct, { color: theme.muted }]}>
            {percent}%
            {inlineCta && counts ? ` · ${counts}` : ""}
          </Text>

          {inlineCta ? cta : null}
        </View>

        {inlineCta ? null : cta}
      </Pressable>
    </AnimatedSection>
  );
}

const AVATAR = 32;

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },

  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
  },

  // Pinned bar
  // Matches the avatar's disc so the three trailing controls are one row of
  // equal targets. Bare 22px glyphs beside a bordered 32px circle read as
  // two different kinds of thing.
  barIcon: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  barStatus: {
    flexDirection: "row",
    alignItems: "center",
    // Tighter than the old spacing.lg: the group carries four things now that
    // the avatar has joined it, and the wordmark needs the width on the left.
    gap: spacing.md,
  },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  streakText: {
    ...type.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    ...type.micro,
    lineHeight: 12,
    letterSpacing: 0,
  },

  // Greeting (scrolls away)
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  greeting: {
    ...type.display,
  },
  greetingMeta: {
    ...type.body,
    fontWeight: weight.regular,
    marginTop: spacing.xxs,
  },

  // Hero: Continue learning. A surface of its own, toned in the course hue —
  // colour and radius carry it rather than the neutral `Card` the lists use,
  // so it stays the loudest thing on the page without becoming their peer.
  continueBlock: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    // No border, alone on this screen. Every other surface separates with a
    // hairline; this one separates with depth, which is what makes it read
    // as sitting above the page rather than drawn on it.
    marginBottom: spacing.xxxl,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  heroTitle: {
    // A step above the course tile's bodyLg, not two. Display (28) beside
    // the well wrapped long LASU course names to three lines and took the
    // card past 280px on its own.
    ...type.title,
  },
  heroTopicRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    // Optical centre of the first line rather than its top edge.
    marginTop: 6,
  },
  heroTopic: {
    // Full contrast, not muted. This is the actual next thing you will read;
    // at muted it sat below the course name in every sense.
    ...type.body,
    flex: 1,
    minWidth: 0,
  },
  heroRule: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    marginHorizontal: -spacing.xl,
  },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  heroPct: {
    ...type.micro,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  continueCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    height: 52,
    // Was missing. This rule was written for a full-width block button and
    // still reads that way — height and radius but no horizontal padding.
    // Once it moved onto the hero row it sized to its label exactly, so the
    // pill hugged the text. Harmless in the stretched variant, required in
    // the inline one.
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  // The sub-1024 variant: out of the row, under the track, full width.
  continueCtaBlock: {
    alignSelf: "stretch",
    marginTop: spacing.lg + 2,
  },
  continueCtaChip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  continueCtaText: {
    ...type.bodyLg,
    fontWeight: weight.black,
  },

  // Shared progress bar (hero + goal rows). The gap above it differs by
  // context, so it is not baked into the shared style.
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  heroTrack: {
    // Thicker than the goal rows' 6, and it takes the slack on its row so
    // the percentage and the button sit at the trailing edge.
    height: 8,
    flex: 1,
  },
  goalTrack: {
    marginTop: spacing.sm,
  },

  // Today's goals — unboxed
  goalsBlock: {
    marginBottom: spacing.xxxl,
  },
  coursesBlock: {
    // Negative gutter so the rail can scroll edge to edge. Its own content
    // padding puts the first ring back on the gutter line, so the heading and
    // the first course still align — but a course scrolled halfway out runs
    // off the screen rather than stopping short of it, which is the cue that
    // there is more to flick to.
    marginHorizontal: -layout.screenGutter,
    marginBottom: spacing.xxxl,
  },
  coursesHeader: {
    paddingHorizontal: layout.screenGutter,
  },
  coursesEmpty: {
    ...type.body,
    fontWeight: weight.regular,
    paddingHorizontal: layout.screenGutter,
  },
  goalsBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  goalRows: {
    flex: 1,
    gap: spacing.lg,
  },
  goalLineTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalRowLabel: {
    ...type.body,
    fontWeight: weight.medium,
  },
  goalRowValue: {
    ...type.body,
    fontWeight: weight.regular,
  },
  goalStatus: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.lg,
    marginLeft: spacing.xs,
  },
  goalEditBox: {
    gap: spacing.md,
  },
  goalEditRow: {
    gap: spacing.sm,
  },
  goalEditLabel: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  goalInput: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    ...type.bodyLg,
    fontWeight: weight.medium,
  },

  // This week — unboxed
  weekBlock: {
    marginBottom: spacing.xxxl,
  },
  // Matches ListSection's own header exactly, so an unboxed block and a
  // grouped list read as the same kind of section.
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  blockTitle: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
    marginLeft: spacing.xs,
  },
  blockAction: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.xs,
  },
  blockActionText: {
    ...type.caption,
    fontWeight: weight.semi,
    letterSpacing: 0,
  },
  weekGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.xl,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  weekCell: {
    // Fixed half-width rather than flex: wrapping needs a resolved basis, and
    // flex: 1 would keep all four on one line.
    width: "50%",
  },

  loadingOverlay: {
    position: "absolute",
    right: layout.screenGutter,
    bottom: 100,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
