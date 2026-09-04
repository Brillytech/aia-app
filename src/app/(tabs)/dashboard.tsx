import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Reanimated from "react-native-reanimated";
import { supabase } from "../../../lib/supabase";
import { category, Theme, useThemeMode } from "../../theme";
import { useContentInset } from "../../ui/layout/breakpoints";
import type { IconName } from "../../ui/alerts";
import { AnimatedSection } from "../../ui/AnimatedSection";
import { PrimaryButton } from "../../ui/Button";
import { CourseRail } from "../../ui/CourseRail";
import { Wordmark } from "../../ui/Wordmark";
import { haptics } from "../../ui/haptics";
import { HintBadge } from "../../ui/HintBadge";
import { FolderIcon } from "../../ui/FolderIcon";
import { dividerInset, ListRow, ListSection } from "../../ui/List";
import { PageHeader } from "../../ui/PageHeader";
import { ProgressRing } from "../../ui/ProgressRing";
import { Screen } from "../../ui/Screen";
import { subjectColor, subjectIcon } from "../../ui/subject";
import {
  layout,
  motion as motionTokens,
  noFocusRing,
  radius,
  shade,
  spacing,
  type,
  weight,
  withAlpha,
} from "../../ui/tokens";

const logo = require("../../../assets/ls-logo.png");

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
  function openInStudy(courseId?: string | null, topicId?: string | null) {
    haptics.tap();

    router.push({
      pathname: "/study",
      params: {
        courseId: courseId || "",
        topicId: topicId || "",
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
  const [continuePressed, setContinuePressed] = useState(false);

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
  // Ink for anything sitting ON the hue. theme.onAccent is white in both
  // modes, which fails badly against the lighter category hues (yellow and
  // green are ~2:1). A heavily darkened version of the hue itself clears 3.7:1
  // against every one of them and reads as deliberate rather than corrective.
  const courseInk = shade(courseAccent, -0.75);
  // The raw hue only works as *text* in dark mode. On the pale tinted panel a
  // light-mode yellow label is ~1.9:1, so light darkens the hue and dark
  // lightens it — same colour identity, legible either way.
  const courseType = isDark
    ? shade(courseAccent, 0.28)
    : shade(courseAccent, -0.42);

  // Scoped to the course this card is actually about. It used to show
  // catalogue-wide progress while sitting under one course's title and topic,
  // which read as that course being further along than it was.
  const continueStats = nextCourse ? getCourseStats(nextCourse.id) : null;

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
              >
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={22}
                  color={theme.text}
                />
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.tap();
                  router.push("/notifications" as any);
                }}
                hitSlop={10}
              >
                <MaterialCommunityIcons
                  name="bell-outline"
                  size={22}
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
                style={[styles.avatar, { borderColor: theme.border }]}
              >
                <Image
                  source={avatarUrl ? { uri: avatarUrl } : logo}
                  style={styles.avatarImage}
                  resizeMode="cover"
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
        <AnimatedSection index={0}>
          <Pressable
            onPress={() =>
              hasContent && nextTopic
                ? openInStudy(nextTopic.course_id, nextTopic.id)
                : router.push("/study" as any)
            }
            onPressIn={() => setContinuePressed(true)}
            onPressOut={() => setContinuePressed(false)}
          >
            <Reanimated.View
              style={[
                styles.continueBlock,
                {
                  backgroundColor: withAlpha(courseAccent, isDark ? 0.16 : 0.1),
                  borderColor: withAlpha(courseAccent, isDark ? 0.3 : 0.2),
                  transform: [{ scale: continuePressed ? 0.985 : 1 }],
                  transitionProperty: "transform",
                  transitionDuration: motionTokens.base,
                },
              ]}
            >
              <View style={styles.continueHead}>
                <Text style={[styles.continueEyebrow, { color: courseType }]}>
                  Pick up where you stopped
                </Text>

                {continueStats && continueStats.total > 0 ? (
                  <Text style={[styles.continueCount, { color: courseType }]}>
                    {continueStats.done}/{continueStats.total}
                  </Text>
                ) : null}
              </View>

              <View style={styles.continueRow}>
                {/* Tilted at rest, and it lifts and opens under the thumb —
                    the same object responding, not a separate hover state. */}
                <Reanimated.View
                  style={[
                    styles.folderWrap,
                    {
                      transform: [
                        { translateY: continuePressed ? -5 : 0 },
                        { rotate: continuePressed ? "-5deg" : "-3deg" },
                      ],
                      transitionProperty: "transform",
                      transitionDuration: motionTokens.base,
                    },
                  ]}
                >
                  <FolderIcon color={courseAccent} size={104} open={continuePressed} />

                  <View style={styles.folderGlyph}>
                    <MaterialCommunityIcons
                      name={subjectIcon(nextCourse)}
                      size={22}
                      color={courseInk}
                    />
                  </View>
                </Reanimated.View>

                <View style={styles.flex1}>
                  <Text style={[styles.continueCode, { color: courseType }]}>
                    {nextCourse?.code || "STUDY"}
                  </Text>

                  <Text style={[styles.continueTitle, { color: theme.text }]}>
                    {nextCourse?.title ||
                      (hasCourses ? "Topics coming soon" : "Learning starts soon")}
                  </Text>

                  <Text style={[styles.continueTopic, { color: theme.muted }]}>
                    {nextTopic?.title ||
                      (hasCourses
                        ? "Your course content will appear here."
                        : "Your courses will appear once setup is ready.")}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.track,
                  styles.heroTrack,
                  { backgroundColor: withAlpha(courseAccent, 0.2) },
                ]}
              >
                <Reanimated.View
                  style={[
                    styles.fill,
                    {
                      width: `${continueStats?.progress ?? 0}%`,
                      backgroundColor: courseAccent,
                      transitionProperty: "width",
                      transitionDuration: motionTokens.slow,
                    },
                  ]}
                />
              </View>

              <View style={[styles.continueCta, { backgroundColor: courseAccent }]}>
                <Text style={[styles.continueCtaText, { color: courseInk }]}>
                  Continue learning
                </Text>
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={20}
                  color={courseInk}
                />
              </View>
            </Reanimated.View>
          </Pressable>
        </AnimatedSection>

        {/* Off the card. The hero above is the only panel on this screen now,
            and a second boxed surface directly beneath it made the two compete
            — this is a ring and three bars, which read fine on the page ground.
            Same header + trailing action as "This week" further down. */}
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

        {/* Not a card, and not a list. See the note on CourseRail — five
            settings-style rows is the wrong shape for "which of my courses am
            I furthest behind on", which is the only question this section is
            here to answer. The rail bleeds past the screen gutter, so it reads
            as something you flick rather than a boxed panel. */}
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
              <CourseRail
                theme={theme}
                courses={railCourses}
                onPressCourse={openInStudy}
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
          <ListSection theme={theme} title="Recommended" plain>
            {recommendedMaterials.length === 0 ? (
              <ListRow
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
                <ListRow
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
          </ListSection>
        </AnimatedSection>

        {/* Not a card. Four non-interactive numbers do not need five rounded
            surfaces and four icon plates — they sit on the page ground. */}
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
              <WeekStat
                theme={theme}
                label="Learning time"
                value={weeklyStats.learningTime}
              />
              <WeekStat
                theme={theme}
                label="Practice accuracy"
                value={`${weeklyStats.practiceAccuracy}%`}
              />
              <WeekStat
                theme={theme}
                label="XP earned"
                value={String(weeklyStats.xp)}
              />
              <WeekStat
                theme={theme}
                label="Leaderboard rank"
                value={weeklyStats.rank}
              />
            </View>
          </View>
        </AnimatedSection>

        {/* Profile is no longer a tab, so it needs a labelled route — not just
            an avatar. This also gives Settings its first entry point that
            doesn't route through Profile first. */}
        <AnimatedSection index={5}>
          <ListSection theme={theme} title="Account">
            <ListRow
              theme={theme}
              icon="account-circle-outline"
              label="Profile"
              onPress={() => router.push("/profile" as any)}
            />

            <ListRow
              theme={theme}
              icon="cog-outline"
              label="Settings"
              onPress={() => router.push("/settings" as any)}
            />
          </ListSection>
        </AnimatedSection>
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

function WeekStat({
  theme,
  label,
  value,
}: {
  theme: Theme;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.weekCell}>
      <Text style={[styles.weekValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.weekLabel, { color: theme.muted }]}>{label}</Text>
    </View>
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
  avatar: {
    width: AVATAR,
    height: AVATAR,
    // Circles stay `size / 2` arithmetic, per the note in tokens.ts.
    borderRadius: AVATAR / 2,
    borderWidth: 1,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
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
    top: -5,
    right: -7,
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
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xxxl,
  },
  continueHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  continueEyebrow: {
    ...type.caption,
    letterSpacing: 0.2,
  },
  continueCount: {
    ...type.caption,
    letterSpacing: 0.2,
  },
  continueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  folderWrap: {
    // Overflow visible so the folder can lift past its box on press.
    alignItems: "center",
    justifyContent: "center",
  },
  folderGlyph: {
    position: "absolute",
    // Sits on the folder's front face rather than centred on the whole shape.
    bottom: 24,
    alignSelf: "center",
  },
  continueCode: {
    ...type.micro,
    letterSpacing: 0.8,
  },
  continueTitle: {
    ...type.title,
    marginTop: spacing.xxs,
  },
  continueTopic: {
    ...type.body,
    fontWeight: weight.regular,
    marginTop: spacing.sm,
  },
  continueCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    marginTop: spacing.xl,
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
    marginTop: spacing.xl,
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
  weekValue: {
    ...type.display,
  },
  weekLabel: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
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
