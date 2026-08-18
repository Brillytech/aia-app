import { MaterialCommunityIcons } from "@expo/vector-icons";
// TODO: Enable when app is ready for production.
// import * as ScreenCapture from "expo-screen-capture";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// This file already uses React Native's Animated for its fade/slide values,
// so Reanimated comes in under its own name — the CSS-transition props are a
// Reanimated 4 feature and are inert on RN's Animated components.
import Reanimated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import { supabase } from "../../../lib/supabase";
import { useScreenTime } from "../../screen-time";
import { category, Theme, useThemeMode } from "../../theme";
import { AlertModal } from "../../ui/AlertModal";
import { formatShareDate, ResultShareCard } from "../../ui/ResultShareCard";
import { buildReviewOptions, ReviewPager } from "../../ui/ReviewPager";
import { Card } from "../../ui/Card";
import { Folder } from "../../ui/Folder";
import { haptics } from "../../ui/haptics";
import { IconPlate } from "../../ui/IconPlate";
import { dividerInset, ListRow, ListSection } from "../../ui/List";
import { Stepper } from "../../ui/Stepper";
import { useCollapse } from "../../ui/useCollapse";
import { subjectColor, subjectIcon } from "../../ui/subject";
import {
  layout,
  motion as motionTokens,
  radius,
  spacing,
  type as typeScale,
  weight,
  withAlpha,
} from "../../ui/tokens";

type Course = {
  id: string;
  code: string;
  title: string;
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
type Topic = { id: string; title: string; description?: string | null };
type Question = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c?: string | null;
  option_d?: string | null;
  option_e?: string | null;
  correct_answer: string;
  explanation?: string | null;
  course_id?: string | null;
  topic_id?: string | null;
};
type Screen = "courses" | "topics" | "setup" | "confirm" | "engine" | "loadingRetry" | "result" | "review";
type ConfidenceLevel = "low" | "medium" | "high";
type PracticeAlertType = "success" | "error" | "warning" | "info";

type PracticeAlertState = {
  visible: boolean;
  type: PracticeAlertType;
  title: string;
  message: string;
  primaryText: string;
  secondaryText?: string;
  onPrimary?: (() => void) | null;
  onSecondary?: (() => void) | null;
};
const PRACTICE_SESSION_KEY = "lasu_scholar_practice_session";
const LASU_SCHOLAR_SHARE_LINK = "https://lasuscholar.com";

const fallbackCourses: Course[] = [
  { id: "demo-cvs", code: "CVS", title: "Cardiovascular System", department: "Medicine", level: "200 Level" },
  { id: "demo-renal", code: "RENAL", title: "Renal Physiology", department: "Medicine", level: "200 Level" },
  { id: "demo-neuro", code: "NEURO", title: "Neuroanatomy", department: "Medicine", level: "200 Level" },
  { id: "demo-ana", code: "ANA201", title: "Gross Anatomy", department: "Medicine", level: "200 Level" },
];

const fallbackTopics: Topic[] = [
  { id: "topic-1", title: "Heart Anatomy", description: "Chambers, valves, vessels and high-yield anatomy." },
  { id: "topic-2", title: "Blood Pressure", description: "Regulation, cardiac output and vascular resistance." },
  { id: "topic-3", title: "ECG Basics", description: "Waves, intervals and interpretation basics." },
];

const fallbackQuestions: Question[] = [
  {
    id: "q1",
    question: "Which chamber of the heart pumps blood into the aorta?",
    option_a: "Right atrium",
    option_b: "Right ventricle",
    option_c: "Left atrium",
    option_d: "Left ventricle",
    correct_answer: "D",
    explanation: "The left ventricle pumps oxygenated blood into the aorta.",
    topic_id: "topic-1",
  },
  {
    id: "q2",
    question: "Which valve is located between the left atrium and left ventricle?",
    option_a: "Tricuspid valve",
    option_b: "Mitral valve",
    option_c: "Pulmonary valve",
    option_d: "Aortic valve",
    correct_answer: "B",
    explanation: "The mitral valve is also called the bicuspid valve.",
    topic_id: "topic-1",
  },
  {
    id: "q3",
    question: "Which vessel carries blood from the right ventricle to the lungs?",
    option_a: "Aorta",
    option_b: "Pulmonary artery",
    option_c: "Pulmonary vein",
    option_d: "Superior vena cava",
    correct_answer: "B",
    explanation: "The pulmonary artery carries deoxygenated blood from the right ventricle to the lungs.",
    topic_id: "topic-1",
  },
];

/** Opacity ramp for the header's soft bottom edge, densest at the top. */
const FADE_STEPS = [0.92, 0.72, 0.48, 0.26, 0.1, 0];
const FADE_HEIGHT = 24;

/** Shim over the shared resolver, keeping the existing call shape. */
function getCourseTheme(courseOrCode: Course | string, title = "") {
  const course = typeof courseOrCode === "string" ? null : courseOrCode;
  const probe = course ?? { code: typeof courseOrCode === "string" ? courseOrCode : "", title };

  return { icon: subjectIcon(probe), color: subjectColor(probe) };
}

function formatTime(totalSeconds: number) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function isUuid(value?: string | null) {
  if (!value) return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sameProfileValue(a?: string | null, b?: string | null) {
  const first = normalizeText(a);
  const second = normalizeText(b);

  if (!first || !second) return false;

  return first === second || first.includes(second) || second.includes(first);
}

function normalizeLevel(value?: string | null) {
  const clean = normalizeText(value).replace(/\s+/g, "");

  if (clean.includes("100")) return "100";
  if (clean.includes("200")) return "200";
  if (clean.includes("300")) return "300";
  if (clean.includes("400")) return "400";
  if (clean.includes("500")) return "500";
  if (clean.includes("600")) return "600";

  return clean;
}

function sameLevel(a?: string | null, b?: string | null) {
  const first = normalizeLevel(a);
  const second = normalizeLevel(b);

  if (!first || !second) return false;

  return first === second;
}

function assignmentMatchesProfile(assignment: any, profile: any) {
  const schoolMatch = sameProfileValue(assignment.school, profile?.school);
  const departmentMatch = sameProfileValue(
    assignment.department,
    profile?.department
  );
  const levelMatch = sameLevel(assignment.level, profile?.level);

  return schoolMatch && departmentMatch && levelMatch;
}

function getBand(percent: number) {
  if (percent >= 80) return { label: "Excellent", color: "#22C55E", note: "Very strong performance. Keep the streak going." };
  if (percent >= 70) return { label: "Very Good", color: "#3B82F6", note: "Good work. Review the few weak points." };
  if (percent >= 60) return { label: "Good", color: "#F97316", note: "Good attempt. Retry missed questions." };
  if (percent >= 50) return { label: "Fair", color: "#F97316", note: "Fair attempt. Retry missed questions." };
  return { label: "Needs Review", color: "#EF4444", note: "Review corrections, then retry wrong questions." };
}

function getResultHeadline(percent: number) {
  if (percent >= 90) return "Elite performance";
  if (percent >= 75) return "Strong attempt";
  if (percent >= 50) return "Good training session";
  return "Review and retry";
}

function getResultMiniNote(percent: number) {
  if (percent >= 90) return "This is the kind of consistency that wins exams.";
  if (percent >= 75) return "A few corrections away from mastery.";
  if (percent >= 50) return "Solid start. Review weak points and retry.";
  return "Every wrong answer is now a clear revision target.";
}

function getWeekStartIso(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);

  current.setDate(diff);
  current.setHours(0, 0, 0, 0);

  return current.toISOString();
}

function calculatePracticeXp({
  correct,
  total,
  percentage,
  confidenceAccuracy,
  confidentWrong,
}: {
  correct: number;
  total: number;
  percentage: number;
  confidenceAccuracy: number;
  confidentWrong: number;
}) {
  const completionBonus = total > 0 ? 20 : 0;
  const accuracyBonus = percentage >= 90 ? 50 : percentage >= 75 ? 30 : percentage >= 50 ? 10 : 0;
  const confidenceBonus = confidenceAccuracy >= 80 ? 15 : confidenceAccuracy >= 60 ? 8 : 0;
  const confidencePenalty = confidentWrong * 2;

  return Math.max(0, correct * 10 + completionBonus + accuracyBonus + confidenceBonus - confidencePenalty);
}

export default function Practice() {
  const { theme, isDark } = useThemeMode();

  const [screen, setScreen] = useState<Screen>("courses");
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  const [questionCountInput, setQuestionCountInput] = useState("20");
  const [hoursInput, setHoursInput] = useState("0");
  const [minutesInput, setMinutesInput] = useState("30");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Preparing Practice Mode...");
  // Boolean rather than a raw offset, so the header animates once at a
  // threshold instead of re-rendering this screen every frame.
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [confidence, setConfidence] = useState<Record<string, ConfidenceLevel>>({});
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [savedSession, setSavedSession] = useState<any>(null);
  const [practiceAlert, setPracticeAlert] = useState<PracticeAlertState>({
    visible: false,
    type: "info",
    title: "",
    message: "",
    primaryText: "OK",
    secondaryText: undefined,
    onPrimary: null,
    onSecondary: null,
  });

  // Counts the whole visit — setting up a session, answering, and reviewing
  // the breakdown afterwards — not just the questions that got submitted.
  useScreenTime("practice", selectedCourse?.id, selectedTopic?.id);

  /** Shown on the shared result card, so it is credited to a person. */
  const [shareUsername, setShareUsername] = useState("LASU Scholar student");

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const resultFade = useRef(new Animated.Value(0)).current;
  const resultLift = useRef(new Animated.Value(18)).current;
  const xpFade = useRef(new Animated.Value(0)).current;
  const resultCardRef = useRef<any>(null);

  const selectedTheme = selectedCourse ? getCourseTheme(selectedCourse) : { icon: "clipboard-text-clock", color: "#F97316" };
  const engineBg = isDark ? "#07101F" : theme.bg;
  const panelBg = isDark ? "#101A2D" : "#FFFDF4";
  const subtlePanel = isDark ? "#0B1528" : "#FFFFFF";

  useEffect(() => { init(); }, []);

  // TODO: Enable this back when the app is ready for production.
  // This blocks screenshots/screen recording on Practice Mode.
  //
  // useEffect(() => {
  //   ScreenCapture.preventScreenCaptureAsync("practice-screen");
  //
  //   return () => {
  //     ScreenCapture.allowScreenCaptureAsync("practice-screen");
  //   };
  // }, []);

  useEffect(() => {
    if (screen !== "engine") return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishPractice();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "engine" || questions.length === 0 || !selectedCourse || !selectedTopic) return;

    const payload = {
      selectedCourse,
      selectedTopic,
      questions,
      answers,
      flagged,
      saved,
      confidence,
      currentIndex,
      secondsLeft,
      startedAt,
      questionCountInput,
      hoursInput,
      minutesInput,
      shuffleQuestions,
    };

    AsyncStorage.setItem(PRACTICE_SESSION_KEY, JSON.stringify(payload));
  }, [screen, questions, answers, flagged, saved, confidence, currentIndex, secondsLeft]);

  function showPracticeAlert({
    type = "info",
    title,
    message,
    primaryText = "OK",
    secondaryText,
    onPrimary = null,
    onSecondary = null,
  }: {
    type?: PracticeAlertType;
    title: string;
    message: string;
    primaryText?: string;
    secondaryText?: string;
    onPrimary?: (() => void) | null;
    onSecondary?: (() => void) | null;
  }) {
    setPracticeAlert({
      visible: true,
      type,
      title,
      message,
      primaryText,
      secondaryText,
      onPrimary,
      onSecondary,
    });
  }

  function closePracticeAlert() {
    setPracticeAlert((prev) => ({ ...prev, visible: false }));
  }

  function handlePracticeAlertPrimary() {
    const action = practiceAlert.onPrimary;
    closePracticeAlert();
    if (action) {
      setTimeout(action, 120);
    }
  }

  function handlePracticeAlertSecondary() {
    const action = practiceAlert.onSecondary;
    closePracticeAlert();
    if (action) {
      setTimeout(action, 120);
    }
  }

  function renderPracticeAlert() {
    return (
      <AlertModal
        theme={theme}
        visible={practiceAlert.visible}
        type={practiceAlert.type}
        title={practiceAlert.title}
        message={practiceAlert.message}
        primaryLabel={practiceAlert.primaryText}
        onPrimary={handlePracticeAlertPrimary}
        secondaryLabel={practiceAlert.secondaryText}
        onSecondary={
          practiceAlert.secondaryText ? handlePracticeAlertSecondary : undefined
        }
        onRequestClose={closePracticeAlert}
      />
    );
  }

  async function init() {
    const existing = await AsyncStorage.getItem(PRACTICE_SESSION_KEY);
    if (existing) {
      try {
        setSavedSession(JSON.parse(existing));
      } catch {
        await AsyncStorage.removeItem(PRACTICE_SESSION_KEY);
      }
    }

    await loadCourses();
  }

  async function loadCourses() {
    setLoading(true);
    setLoadingText("Preparing practice mode...");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setCourses([]);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school, faculty, department, level, username, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.log("PRACTICE PROFILE ERROR:", profileError.message);
      setCourses([]);
      setLoading(false);
      return;
    }

    if (profile?.username || profile?.full_name) {
      setShareUsername(profile.username || profile.full_name);
    }

    if (!profile?.school || !profile?.department || !profile?.level) {
      setCourses([]);
      setLoading(false);
      return;
    }

    const profileFaculty =
      profile.school === "LASUCOM"
        ? "College of Medicine"
        : profile.faculty;

    const { data: control, error: controlError } = await supabase
      .from("app_period_controls")
      .select("live_period_id")
      .eq("school", profile.school)
      .eq("department", profile.department)
      .eq("level", profile.level)
      .maybeSingle();

    if (controlError) {
      console.log("PRACTICE LIVE PERIOD CONTROL ERROR:", controlError.message);
      setCourses([]);
      setLoading(false);
      return;
    }

    const livePeriodId = control?.live_period_id;

    if (!livePeriodId) {
      setCourses([]);
      setLoading(false);
      return;
    }

    let ownedQuery = supabase
      .from("courses")
      .select(
        "id, code, title, semester, status, school, faculty, department, level, academic_period_id, course_icon, course_color"
      )
      .eq("school", profile.school)
      .eq("department", profile.department)
      .eq("level", profile.level)
      .eq("academic_period_id", livePeriodId)
      .order("created_at", { ascending: false });

    if (profile.school === "LASU" && profileFaculty) {
      ownedQuery = ownedQuery.eq("faculty", profileFaculty);
    }

    const [{ data: ownedCourses, error: ownedError }, { data: sharedRows, error: sharedError }] =
      await Promise.all([
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
          `
          )
          .eq("school", profile.school)
          .eq("department", profile.department)
          .eq("level", profile.level)
          .eq("academic_period_id", livePeriodId),
      ]);

    if (ownedError) {
      console.log("PRACTICE OWNED COURSES ERROR:", ownedError.message);
    }

    if (sharedError) {
      console.log("PRACTICE SHARED COURSES ERROR:", sharedError.message);
    }

    const directCourses = (ownedCourses || []).map((course: any) => ({
      ...course,
      is_shared: false,
    })) as Course[];

    const sharedCourses = (sharedRows || [])
      .map((row: any) => {
        const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;

        if (!course) return null;

        return {
          ...course,
          school: row.school,
          faculty: row.faculty,
          department: row.department,
          level: row.level,
          academic_period_id: row.academic_period_id,
          is_shared: true,
        } as Course;
      })
      .filter(Boolean) as Course[];

    const uniqueCourses = Array.from(
      new Map([...directCourses, ...sharedCourses].map((course) => [course.id, course])).values()
    ).filter((course) => (course.status || "active") === "active");

    setCourses(uniqueCourses);
    setLoading(false);
  }

  async function openCourse(course: Course) {
    setSelectedCourse(course);
    setSelectedTopic(null);
    setScreen("topics");
    setLoading(true);
    setLoadingText("Loading topics...");
    if (!isUuid(course.id)) {
      setTopics(fallbackTopics);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("course_id", course.id)
      // Ascending, matching dashboard and study. This was the only screen
      // ordering newest-first, which put topic 1 at the bottom of the list.
      .order("created_at", { ascending: true });

    setTopics(error || !data ? [] : data);
    setLoading(false);
  }

  function openTopic(topic: Topic) { setSelectedTopic(topic); setScreen("setup"); }

  function resumeSavedSession() {
    if (!savedSession) return;

    setSelectedCourse(savedSession.selectedCourse);
    setSelectedTopic(savedSession.selectedTopic);
    setQuestions(savedSession.questions || []);
    setAnswers(savedSession.answers || {});
    setFlagged(savedSession.flagged || {});
    setSaved(savedSession.saved || {});
    setConfidence(savedSession.confidence || {});
    setCurrentIndex(savedSession.currentIndex || 0);
    setSecondsLeft(savedSession.secondsLeft || 30 * 60);
    setStartedAt(savedSession.startedAt || Date.now());
    setQuestionCountInput(savedSession.questionCountInput || "20");
    setHoursInput(savedSession.hoursInput || "0");
    setMinutesInput(savedSession.minutesInput || "30");
    setShuffleQuestions(!!savedSession.shuffleQuestions);
    setScreen("engine");
    setTimeout(animateQuestion, 30);
  }

  async function discardSavedSession() {
    await AsyncStorage.removeItem(PRACTICE_SESSION_KEY);
    setSavedSession(null);
  }

  function getQuestionLimit() {
    const parsed = Number(questionCountInput);
    if (!Number.isFinite(parsed) || parsed < 1) return 10;
    return Math.min(Math.floor(parsed), 300);
  }

  function getDurationSeconds() {
    const hrs = Number(hoursInput);
    const mins = Number(minutesInput);
    const safeHrs = Number.isFinite(hrs) && hrs > 0 ? Math.floor(hrs) : 0;
    const safeMins = Number.isFinite(mins) && mins > 0 ? Math.floor(mins) : 0;
    const total = safeHrs * 3600 + safeMins * 60;
    return total > 0 ? total : 30 * 60;
  }

  async function startPractice() {
    if (!selectedCourse || !selectedTopic) return;

    const limit = getQuestionLimit();
    const duration = getDurationSeconds();

    setLoading(true);
    setLoadingText("Fetching real dashboard questions...");
    setAnswers({});
    setFlagged({});
    setSaved({});
    setConfidence({});
    setCurrentIndex(0);
    setSecondsLeft(duration);
    setStartedAt(Date.now());

    let loadedQuestions: Question[] = [];

    if (!isUuid(selectedCourse.id)) {
      loadedQuestions = fallbackQuestions.slice(0, limit);
    } else {
      const { data, error } = await supabase
        .from("questions")
        .select("id, course_id, topic_id, question, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation")
        .eq("course_id", selectedCourse.id)
        .eq("topic_id", selectedTopic.id)
        .limit(limit);

      if (error) {
        setLoading(false);
        showPracticeAlert({
          type: "error",
          title: "Could not fetch questions",
          message: error.message,
        });
        return;
      }

      loadedQuestions = (data || []) as Question[];
    }

    if (loadedQuestions.length === 0) {
      setLoading(false);
      showPracticeAlert({
        type: "info",
        title: "No Questions Yet",
        message: "No practice questions have been added for this topic yet.",
      });
      return;
    }

    if (shuffleQuestions) {
      loadedQuestions = [...loadedQuestions].sort(() => Math.random() - 0.5);
    }

    setQuestions(loadedQuestions);
    setLoading(false);
    setScreen("engine");
    animateQuestion();
  }

  function animateQuestion() {
    fade.setValue(0);
    slide.setValue(12);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  function chooseAnswer(id: string, answer: string) { setAnswers((prev) => ({ ...prev, [id]: answer })); }
  function goToQuestion(index: number) { setNavigatorOpen(false); setCurrentIndex(index); setTimeout(animateQuestion, 20); }
  function nextQuestion() { if (currentIndex < questions.length - 1) { setCurrentIndex((prev) => prev + 1); setTimeout(animateQuestion, 20); } }
  function previousQuestion() { if (currentIndex > 0) { setCurrentIndex((prev) => prev - 1); setTimeout(animateQuestion, 20); } }
  function toggleFlag(id: string) { setFlagged((prev) => ({ ...prev, [id]: !prev[id] })); }
  function toggleSave(id: string) { setSaved((prev) => ({ ...prev, [id]: !prev[id] })); }

  function chooseConfidence(id: string, level: ConfidenceLevel) {
    setConfidence((prev) => ({
      ...prev,
      [id]: prev[id] === level ? undefined as any : level,
    }));
  }

  const score = useMemo(() => questions.reduce((total, q) => answers[q.id] === q.correct_answer.toUpperCase() ? total + 1 : total, 0), [answers, questions]);
  const skipped = questions.filter((q) => !answers[q.id]).length;
  const wrong = questions.length - score - skipped;
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const confidenceAnswered = questions.filter((q) => confidence[q.id]).length;
  const confidentCorrect = questions.filter((q) => confidence[q.id] === "high" && answers[q.id] === q.correct_answer.toUpperCase()).length;
  const confidentWrong = questions.filter((q) => confidence[q.id] === "high" && answers[q.id] !== q.correct_answer.toUpperCase()).length;
  const confidenceAccuracy = confidenceAnswered > 0 ? Math.round((confidentCorrect / confidenceAnswered) * 100) : 0;
  const practicePoints = calculatePracticeXp({
    correct: score,
    total: questions.length,
    percentage,
    confidenceAccuracy,
    confidentWrong,
  });
  const timeUsed = startedAt ? Math.max(1, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  const speed = questions.length > 0 ? Math.round(timeUsed / questions.length) : 0;
  const band = getBand(percentage);

  function submitPractice() {
    if (screen !== "engine") return;
    if (skipped > 0) {
      showPracticeAlert({
        type: "warning",
        title: "Submit Practice?",
        message: `You still have ${skipped} unanswered question(s).`,
        primaryText: "Submit",
        secondaryText: "Continue",
        onPrimary: finishPractice,
      });
      return;
    }
    finishPractice();
  }

  async function finishPractice() {
    setLoading(true);
    setLoadingText("Analyzing performance...");
    setTimeout(async () => {
      await updateProgress();
      await savePracticeAttempt();
      await AsyncStorage.removeItem(PRACTICE_SESSION_KEY);
      setSavedSession(null);
      setLoading(false);
      setScreen("result");
      animateResult();
    }, 850);
  }

  async function updateProgress() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user || !selectedCourse || !selectedTopic || !isUuid(selectedCourse.id)) return;
    // Answered, not the session size. Recording questions.length meant
    // skipping every question still logged a full session's work, and it
    // also deflated profile accuracy (correct / picked, rather than
    // correct / answered).
    await supabase.from("user_progress").insert({
      user_id: user.id,
      course_id: selectedCourse.id,
      topic_id: selectedTopic.id,
      questions_studied: score + wrong,
      questions_correct: score,
      materials_opened: 0,
      progress_percent: percentage,
    });
  }

  async function savePracticeAttempt() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user || !selectedCourse || !selectedTopic || !isUuid(selectedCourse.id)) return;

    const { data: attempt, error: attemptError } = await supabase
      .from("practice_attempts")
      .insert({
        user_id: user.id,
        course_id: selectedCourse.id,
        topic_id: selectedTopic.id,
        score_percent: percentage,
        correct_answers: score,
        wrong_answers: wrong,
        unanswered: skipped,
        time_used_seconds: timeUsed,
        xp_earned: practicePoints,
        confidence_answered: confidenceAnswered,
        confidence_accuracy: confidenceAccuracy,
        high_confidence_wrong: confidentWrong,
      })
      .select("id")
      .single();

    if (attemptError || !attempt) return;

    const answerRows = questions.map((q) => {
      const selected = answers[q.id] || null;
      const correct = q.correct_answer.toUpperCase();

      return {
        attempt_id: attempt.id,
        user_id: user.id,
        question_id: q.id,
        selected_answer: selected,
        correct_answer: correct,
        is_correct: selected === correct,
        confidence: confidence[q.id] || null,
      };
    });

    if (answerRows.length > 0) {
      await supabase.from("practice_answers").insert(answerRows);
    }

    const weekStart = getWeekStartIso();

    await supabase.from("xp_events").insert({
      user_id: user.id,
      source: "practice",
      source_id: attempt.id,
      xp: practicePoints,
      week_start: weekStart,
      description: `${selectedCourse.code} practice session`,
    });

    await supabase.from("user_activity_logs").insert({
      user_id: user.id,
      mode: "practice",
      course_id: selectedCourse.id,
      topic_id: selectedTopic.id,
      // Zero, deliberately. `useScreenTime` is the single source of learning
      // time now; leaving `timeUsed` here would count the session twice.
      duration_seconds: 0,
      xp_earned: practicePoints,
      accuracy_percent: percentage,
      correct_answers: score,
      total_questions: questions.length,
      week_start: weekStart,
    });
  }

  function animateResult() {
    resultFade.setValue(0);
    resultLift.setValue(18);
    xpFade.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(resultFade, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(resultLift, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
      Animated.timing(xpFade, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }

  async function shareResultCard() {
    try {
      const uri = await resultCardRef.current?.capture?.();

      if (!uri) {
        showPracticeAlert({
          type: "warning",
          title: "Result Card Not Ready",
          message: "Please wait a moment and try sharing again.",
        });
        return;
      }

      const shareCaption = `I just scored ${percentage}% in ${selectedCourse?.code || "Practice Mode"} on LASU Scholar.

${getResultHeadline(percentage)}. ${getResultMiniNote(percentage)}

Join LASU Scholar today and study smarter with CBT practice, course materials, exam prep and progress tracking.
${LASU_SCHOLAR_SHARE_LINK}`;

      const available = await Sharing.isAvailableAsync();

      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share LASU Scholar Practice Result",
        });

        showPracticeAlert({
          type: "info",
          title: "Caption Ready",
          message: shareCaption,
        });

        return;
      }

      await Share.share({
        message: shareCaption,
        url: uri,
        title: "LASU Scholar Practice Result",
      });
    } catch (error) {
      console.log("SHARE RESULT ERROR:", error);
      showPracticeAlert({
        type: "error",
        title: "Could Not Share",
        message: "Something went wrong while preparing your result card.",
      });
    }
  }

  function renderCompactShareCard() {
    return (
      <ResultShareCard
        theme={theme}
        mode="Practice"
        accent={selectedTheme.color}
        courseCode={selectedCourse?.code || "Practice"}
        courseTitle={selectedCourse?.title}
        topicTitle={selectedTopic?.title}
        username={shareUsername}
        percent={percentage}
        bandLabel={band.label}
        bandColor={band.color}
        correct={score}
        total={questions.length}
        wrong={wrong}
        timeLabel={formatTime(timeUsed)}
        xp={practicePoints}
        dateLabel={formatShareDate()}
      />
    );
  }

  function retryWrongQuestions() {
    setScreen("loadingRetry");
    setLoadingText("Preparing wrong-question retry...");
    setTimeout(() => {
      const wrongQuestions = questions.filter((q) => answers[q.id] !== q.correct_answer.toUpperCase());
      if (wrongQuestions.length === 0) {
        showPracticeAlert({
          type: "success",
          title: "Clean Sheet",
          message: "You answered everything correctly.",
        });
        setScreen("result");
        return;
      }
      setQuestions(wrongQuestions);
      setAnswers({});
      setConfidence({});
      setCurrentIndex(0);
      setSecondsLeft(getDurationSeconds());
      setStartedAt(Date.now());
      setScreen("engine");
      animateQuestion();
    }, 850);
  }

  function retryFlagged() {
    const flaggedQuestions = questions.filter((q) => flagged[q.id]);
    if (flaggedQuestions.length === 0) {
      showPracticeAlert({
        type: "info",
        title: "No Flagged Questions",
        message: "You have not flagged any question in this session.",
      });
      return;
    }
    setQuestions(flaggedQuestions);
    setAnswers({});
    setConfidence({});
    setCurrentIndex(0);
    setSecondsLeft(getDurationSeconds());
    setStartedAt(Date.now());
    setScreen("engine");
    animateQuestion();
  }

  function retrySaved() {
    const savedQuestions = questions.filter((q) => saved[q.id]);
    if (savedQuestions.length === 0) {
      showPracticeAlert({
        type: "info",
        title: "No Saved Questions",
        message: "You have not saved any question in this session.",
      });
      return;
    }
    setQuestions(savedQuestions);
    setAnswers({});
    setConfidence({});
    setCurrentIndex(0);
    setSecondsLeft(getDurationSeconds());
    setStartedAt(Date.now());
    setScreen("engine");
    animateQuestion();
  }

  async function resetPractice() {
    await AsyncStorage.removeItem(PRACTICE_SESSION_KEY);
    setSavedSession(null);
    setQuestions([]);
    setAnswers({});
    setFlagged({});
    setSaved({});
    setConfidence({});
    setCurrentIndex(0);
    setSelectedTopic(null);
    setScreen("topics");
  }

  const currentQuestion = questions[currentIndex];

  if (loading || screen === "loadingRetry") {
    return (
      <View style={[styles.screen, { backgroundColor: engineBg }]}>
        <View style={[styles.loadingCard, { backgroundColor: panelBg, borderColor: theme.border }]}>
          <ActivityIndicator size="large" color={selectedTheme.color} />
          <Text style={[styles.loadingTitle, { color: theme.text }]}>{loadingText}</Text>
          <Text style={[styles.loadingSub, { color: theme.muted }]}>Setting up a clean practice engine for you.</Text>
        </View>
      </View>
    );
  }

  if (screen === "courses") {
    return (
      <CoursesScreen
        theme={theme}
        isDark={isDark}
        insets={insets}
        courses={courses}
        savedSession={savedSession}
        onResume={resumeSavedSession}
        onDiscard={discardSavedSession}
        onOpenCourse={openCourse}
      />
    );
  }

  if (screen === "topics") {
    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md }]}>
          <TouchableOpacity onPress={() => setScreen("courses")} activeOpacity={0.86} style={styles.backBtn}>
            <View style={[styles.backIconWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={theme.text} />
            </View>
            <Text style={[styles.backText, { color: theme.text }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.kicker, { color: selectedTheme.color }]}>
            {selectedCourse?.code}
          </Text>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Select topic</Text>

          {topics.length === 0 ? (
            <EmptyState
              theme={theme}
              icon="bullseye-arrow"
              title="No topics yet"
              text="No topics have been added for this course yet."
            />
          ) : (
            <View style={styles.list}>
              {topics.map((topic) => (
                <Card
                  key={topic.id}
                  onPress={() => openTopic(topic)}
                  theme={theme}
                  tone={selectedTheme.color}
                  backgroundColor={theme.card}
                  borderColor={theme.border}
                  shadowColor={theme.shadow}
                  radiusSize="lg"
                  style={styles.topicCard}
                >
                  <IconPlate
                    theme={theme}
                    icon="bullseye-arrow"
                    color={selectedTheme.color}
                    size="md"
                  />

                  <View style={styles.flex1}>
                    <Text style={[styles.topicTitle, { color: theme.text }]}>
                      {topic.title}
                    </Text>
                    {topic.description ? (
                      <Text style={[styles.topicDesc, { color: theme.muted }]}>
                        {topic.description}
                      </Text>
                    ) : null}
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={withAlpha(selectedTheme.color, 0.75)}
                  />
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  if (screen === "setup") {
    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.headerRow}>
            <BackButton theme={theme} onPress={() => setScreen("topics")} />

            <View style={styles.flex1}>
              <Text style={[styles.pageTitle, { color: theme.text }]}>Session setup</Text>
              <Text style={[styles.pageSubline, { color: theme.muted }]}>
                {selectedCourse?.code} · {selectedTopic?.title}
              </Text>
            </View>
          </View>

          {/* Same controls as before, regrouped: the panel-inside-a-panel is
              gone, and each field sits in a labelled section. */}
          <ListSection theme={theme} title="Questions" inset={dividerInset.none}>
            <ListRow
              theme={theme}
              label="How many"
              accessory={
                <Stepper
                  theme={theme}
                  color={selectedTheme.color}
                  value={questionCountInput}
                  onChangeText={setQuestionCountInput}
                  step={5}
                  min={1}
                  max={200}
                  placeholder="20"
                />
              }
            />

            <ListRow
              theme={theme}
              label="Shuffle questions"
              accessory={
                <Switch
                  value={shuffleQuestions}
                  onValueChange={setShuffleQuestions}
                  trackColor={{ false: theme.soft, true: selectedTheme.color }}
                  thumbColor={theme.card}
                  ios_backgroundColor={theme.soft}
                />
              }
            />
          </ListSection>

          <ListSection theme={theme} title="Duration" inset={dividerInset.none}>
            <ListRow
              theme={theme}
              label="Hours"
              accessory={
                <Stepper
                  theme={theme}
                  color={selectedTheme.color}
                  value={hoursInput}
                  onChangeText={setHoursInput}
                  min={0}
                  max={6}
                  placeholder="0"
                />
              }
            />

            <ListRow
              theme={theme}
              label="Minutes"
              accessory={
                <Stepper
                  theme={theme}
                  color={selectedTheme.color}
                  value={minutesInput}
                  onChangeText={setMinutesInput}
                  step={5}
                  min={0}
                  max={59}
                  placeholder="30"
                />
              }
            />
          </ListSection>

          <View
            style={[
              styles.summaryStrip,
              { backgroundColor: withAlpha(selectedTheme.color, isDark ? 0.2 : 0.12) },
            ]}
          >
            <MaterialCommunityIcons
              name="clock-check-outline"
              size={20}
              color={selectedTheme.color}
            />
            <Text style={[styles.summaryStripText, { color: theme.text }]}>
              {getQuestionLimit()} questions · {formatTime(getDurationSeconds())}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setScreen("confirm")}
            style={[styles.primaryButton, { backgroundColor: selectedTheme.color }]}
          >
            <MaterialCommunityIcons name="play" size={22} color={theme.onAccent} />
            <Text style={[styles.primaryText, { color: theme.onAccent }]}>
              Start practice
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }


  if (screen === "confirm") {
    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.headerRow}>
            <BackButton theme={theme} onPress={() => setScreen("setup")} />
            <Text style={[styles.pageTitle, { color: theme.text }]}>Ready?</Text>
          </View>

          {/* The two numbers you actually chose, up front. The old version
              buried them as rows four and five under a hero icon and a
              "Review your setup before starting." line that restated the
              screen it was on. */}
          <View style={styles.confirmHero}>
            <View style={styles.confirmStat}>
              <Text style={[styles.confirmStatValue, { color: selectedTheme.color }]}>
                {getQuestionLimit()}
              </Text>
              <Text style={[styles.confirmStatLabel, { color: theme.muted }]}>
                questions
              </Text>
            </View>

            <View style={[styles.confirmDivider, { backgroundColor: theme.border }]} />

            <View style={styles.confirmStat}>
              <Text style={[styles.confirmStatValue, { color: selectedTheme.color }]}>
                {formatTime(getDurationSeconds())}
              </Text>
              <Text style={[styles.confirmStatLabel, { color: theme.muted }]}>
                on the clock
              </Text>
            </View>
          </View>

          <ListSection theme={theme} title="Session" inset={dividerInset.none}>
            <ListRow
              theme={theme}
              label="Course"
              value={selectedCourse?.code || "Course"}
              chevron={false}
            />
            <ListRow
              theme={theme}
              label="Topic"
              value={selectedTopic?.title || "Topic"}
              chevron={false}
            />
            <ListRow
              theme={theme}
              label="Question order"
              value={shuffleQuestions ? "Shuffled" : "In order"}
              chevron={false}
            />
            <ListRow
              theme={theme}
              label="Confidence rating"
              value="Optional"
              chevron={false}
            />
          </ListSection>

          <TouchableOpacity
            onPress={startPractice}
            style={[styles.primaryButton, { backgroundColor: selectedTheme.color }]}
          >
            <MaterialCommunityIcons name="play-circle" size={22} color={theme.onAccent} />
            <Text style={[styles.primaryText, { color: theme.onAccent }]}>
              Begin session
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setScreen("setup")}
            style={styles.secondaryButton}
          >
            <Text style={[styles.secondaryText, { color: theme.muted }]}>
              Change settings
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (screen === "engine" && currentQuestion) {
    const options = [["A", currentQuestion.option_a], ["B", currentQuestion.option_b], ["C", currentQuestion.option_c], ["D", currentQuestion.option_d], ["E", currentQuestion.option_e]].filter(([, value]) => value);
    // Typed as a percentage rather than a bare string, which TS otherwise
    // widens and refuses against DimensionValue.
    const progressWidth: `${number}%` = `${
      ((currentIndex + 1) / questions.length) * 100
    }%`;
    return (
      <View style={[styles.engineScreen, { backgroundColor: engineBg }]}>
        <View style={[styles.engineTopBar, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setScreen("setup")} style={styles.circleBtn}><MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} /></TouchableOpacity>
          <View style={{ flex: 1 }}><Text style={[styles.engineCourse, { color: theme.text }]}>{selectedCourse?.code}</Text><Text style={[styles.engineTopic, { color: theme.muted }]} numberOfLines={1}>{selectedTopic?.title}</Text></View>
          <View style={[styles.timerPill, { backgroundColor: `${selectedTheme.color}16`, borderColor: selectedTheme.color }]}><MaterialCommunityIcons name="timer-sand" size={17} color={selectedTheme.color} /><Text style={[styles.timerText, { color: selectedTheme.color }]}>{formatTime(secondsLeft)}</Text></View>
        </View>
        <View style={styles.engineTools}>
          <TouchableOpacity onPress={() => toggleSave(currentQuestion.id)} style={styles.toolBtn}><MaterialCommunityIcons name={saved[currentQuestion.id] ? "bookmark-check" : "bookmark-outline"} size={24} color={saved[currentQuestion.id] ? "#EAB308" : theme.muted} /></TouchableOpacity>
          <TouchableOpacity onPress={() => toggleFlag(currentQuestion.id)} style={styles.toolBtn}><MaterialCommunityIcons name={flagged[currentQuestion.id] ? "flag-variant" : "flag-variant-outline"} size={24} color={flagged[currentQuestion.id] ? "#EF4444" : theme.muted} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setNavigatorOpen(true)} style={styles.toolBtn}><MaterialCommunityIcons name="view-grid-plus-outline" size={24} color={theme.muted} /></TouchableOpacity>
          <TouchableOpacity onPress={submitPractice} style={[styles.submitSmall, { backgroundColor: selectedTheme.color }]}><Text style={styles.submitSmallText}>Submit</Text></TouchableOpacity>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.soft }]}>
          <View
            style={[
              styles.progressFill,
              { width: progressWidth, backgroundColor: selectedTheme.color },
            ]}
          />
        </View>
        <ScrollView contentContainerStyle={styles.engineScroll}>
          <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
            {/* The counter lives in the bottom bar and the progress bar above;
                repeating it here was a third copy of the same fact. */}
            <Text style={[styles.questionText, { color: theme.text }]}>
              {currentQuestion.question}
            </Text>

            <View style={styles.confidenceRow}>
              {[
                ["low", "Not Sure"],
                ["medium", "Sure"],
                ["high", "Very Sure"],
              ].map(([level, label]) => {
                const active = confidence[currentQuestion.id] === level;
                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => chooseConfidence(currentQuestion.id, level as ConfidenceLevel)}
                    style={[
                      styles.confidenceChip,
                      {
                        borderColor: active ? selectedTheme.color : theme.border,
                        backgroundColor: active ? `${selectedTheme.color}14` : "transparent",
                      },
                    ]}
                  >
                    <Text style={[styles.confidenceText, { color: active ? selectedTheme.color : theme.muted }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* One grouped container with dividers, matching study — the old
                version drew a separate bordered card per option, and gave each
                one a radio AND a letter doing the same job. */}
            <View style={[styles.optionsWrap, { backgroundColor: theme.card }]}>
              {options.map(([letter, value], index) => {
                const selected = answers[currentQuestion.id] === letter;

                return (
                  <View key={letter}>
                    {index > 0 ? (
                      <View
                        style={[styles.optionDivider, { backgroundColor: theme.border }]}
                      />
                    ) : null}

                    <TouchableOpacity
                      onPress={() => chooseAnswer(currentQuestion.id, letter as string)}
                      activeOpacity={0.85}
                      style={[
                        styles.optionRow,
                        {
                          backgroundColor: selected
                            ? withAlpha(selectedTheme.color, isDark ? 0.2 : 0.12)
                            : "transparent",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.optionBadge,
                          {
                            backgroundColor: selected
                              ? selectedTheme.color
                              : withAlpha(selectedTheme.color, isDark ? 0.22 : 0.14),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionBadgeText,
                            { color: selected ? theme.onAccent : selectedTheme.color },
                          ]}
                        >
                          {letter}
                        </Text>
                      </View>

                      <Text style={[styles.optionText, { color: theme.text }]}>
                        {value}
                      </Text>

                      {selected ? (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={20}
                          color={selectedTheme.color}
                        />
                      ) : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        </ScrollView>
        <View style={[styles.bottomNav, { borderTopColor: theme.border, backgroundColor: engineBg }]}>
          <TouchableOpacity onPress={previousQuestion} disabled={currentIndex === 0} style={[styles.navBtn, { opacity: currentIndex === 0 ? 0.35 : 1 }]}><MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} /><Text style={[styles.navText, { color: theme.text }]}>Previous</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setNavigatorOpen(true)} style={[styles.questionNavBtn, { borderColor: theme.border }]}><Text style={[styles.navText, { color: theme.text }]}>{currentIndex + 1}/{questions.length}</Text></TouchableOpacity>
          {currentIndex === questions.length - 1 ? <TouchableOpacity onPress={submitPractice} style={[styles.nextBtn, { backgroundColor: selectedTheme.color }]}><Text style={styles.nextText}>Submit</Text></TouchableOpacity> : <TouchableOpacity onPress={nextQuestion} style={[styles.nextBtn, { backgroundColor: selectedTheme.color }]}><Text style={styles.nextText}>Next</Text><MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" /></TouchableOpacity>}
        </View>
        <QuestionNavigator open={navigatorOpen} setOpen={setNavigatorOpen} questions={questions} answers={answers} flagged={flagged} confidence={confidence} currentIndex={currentIndex} goToQuestion={goToQuestion} theme={theme} panelBg={panelBg} color={selectedTheme.color} />
        {renderPracticeAlert()}
      </View>
    );
  }

  if (screen === "result") {
    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md }]} showsVerticalScrollIndicator={false}>
          {/* The score is the whole point of this screen, so it gets the
              screen — not a row in an eight-cell grid. The brand lockup and
              the "lasuscholar.com" footer moved out entirely: they belong on
              the shared image, which already draws its own. */}
          <Animated.View
            style={[
              styles.scoreHero,
              { opacity: resultFade, transform: [{ translateY: resultLift }] },
            ]}
          >
            <Text style={[styles.percentText, { color: band.color }]}>{percentage}%</Text>
            <Text style={[styles.accuracyText, { color: theme.muted }]}>Accuracy</Text>

            <View
              style={[
                styles.bandPill,
                { backgroundColor: withAlpha(band.color, isDark ? 0.24 : 0.16) },
              ]}
            >
              <Text style={[styles.bandText, { color: band.color }]}>{band.label}</Text>
            </View>

            <View style={[styles.resultTrack, { backgroundColor: theme.soft }]}>
              <View
                style={[
                  styles.resultFill,
                  { width: `${percentage}%`, backgroundColor: band.color },
                ]}
              />
            </View>

            <Text style={[styles.bandNote, { color: theme.muted }]}>{band.note}</Text>
          </Animated.View>

          {/* Three headline numbers, unboxed. The other five are real data but
              secondary, so they drop to a list below instead of competing. */}
          <View style={styles.headlineRow}>
            <HeadlineStat theme={theme} label="Correct" value={String(score)} color={theme.success} />
            <HeadlineStat theme={theme} label="Wrong" value={String(wrong)} color={theme.error} />
            <HeadlineStat theme={theme} label="Time" value={formatTime(timeUsed)} color={theme.info} />
          </View>

          <ListSection theme={theme} title="Breakdown" inset={dividerInset.none}>
            <ListRow theme={theme} label="Skipped" value={String(skipped)} chevron={false} />
            <ListRow theme={theme} label="Speed" value={`${speed}s per question`} chevron={false} />
            <ListRow
              theme={theme}
              label="Confidence accuracy"
              value={confidenceAnswered > 0 ? `${confidenceAccuracy}%` : "—"}
              chevron={false}
            />
            <ListRow
              theme={theme}
              label="Confident but wrong"
              value={String(confidentWrong)}
              chevron={false}
            />
            <ListRow
              theme={theme}
              label="Points earned"
              value={`+${practicePoints} XP`}
              chevron={false}
            />
          </ListSection>

          <View style={styles.hiddenShareWrap}>
            {/* No `collapsable` prop — ViewShot already applies it to its own
                inner view, and passing it here was a type error. */}
            <ViewShot ref={resultCardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
              {renderCompactShareCard()}
            </ViewShot>
          </View>

          {/* Subtitles dropped — "Review Answers / Check corrections and
              explanations" restated itself, and that exact string was also
              duplicated in exam.tsx. */}
          <ListSection theme={theme} title="Next">
            <ListRow theme={theme} icon="share-variant" label="Share result card" onPress={shareResultCard} />
            <ListRow theme={theme} icon="clipboard-search-outline" label="Review answers" onPress={() => setScreen("review")} />
            {wrong > 0 ? (
              <ListRow theme={theme} icon="restore" label="Retry wrong questions" value={String(wrong)} onPress={retryWrongQuestions} />
            ) : null}
            <ListRow theme={theme} icon="flag-variant" label="Retry flagged" onPress={retryFlagged} />
            <ListRow theme={theme} icon="bookmark-check" label="Retry saved" onPress={retrySaved} />
          </ListSection>

          <View style={styles.resultButtons}>
            <TouchableOpacity
              onPress={resetPractice}
              style={[styles.resultButton, { backgroundColor: selectedTheme.color }]}
            >
              <Text style={[styles.resultButtonText, { color: theme.onAccent }]}>
                Practice again
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/dashboard")}
              style={[styles.resultButton, { backgroundColor: theme.card }]}
            >
              <Text style={[styles.resultButtonText, { color: theme.text }]}>Dashboard</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {renderPracticeAlert()}
      </View>
    );
  }

  if (screen === "review") {
    return (
      <ReviewPager
        theme={theme}
        title="Review"
        onExit={() => setScreen("result")}
        items={questions.map((q) => ({
          id: q.id,
          question: q.question,
          options: buildReviewOptions(q),
          correctKey: q.correct_answer.toUpperCase(),
          chosenKey: answers[q.id] || null,
          explanation: q.explanation,
          confidence: confidence[q.id] || null,
        }))}
      />
    );
  }

  return null;
}

function ConfirmRow({ label, value, theme }: any) {
  return (
    <View style={styles.confirmRow}>
      <Text style={[styles.confirmLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.confirmValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function ToggleRow({ label, value, setValue, theme, color }: any) {
  return <TouchableOpacity onPress={() => setValue(!value)} style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text><View style={[styles.toggleBox, { backgroundColor: value ? color : theme.soft, borderColor: value ? color : theme.border }]}>{value && <MaterialCommunityIcons name="check-bold" size={17} color="#FFFFFF" />}</View></TouchableOpacity>;
}

function BackButton({ theme, onPress }: { theme: Theme; onPress?: () => void }) {
  // Glyph only. A chevron pointing left already says "back" — the label was
  // spending a row of height to repeat it.
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        (onPress ?? router.back)();
      }}
      hitSlop={12}
      style={styles.backBtn}
    >
      <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text} />
    </Pressable>
  );
}

function EmptyState({
  theme,
  icon,
  title,
  text,
}: {
  theme: any;
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <MaterialCommunityIcons name={icon as any} size={42} color={theme.orange} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: theme.muted }]}>{text}</Text>
    </View>
  );
}

function HeadlineStat({
  theme,
  label,
  value,
  color,
}: {
  theme: Theme;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.flex1}>
      <Text style={[styles.headlineValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.headlineLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

function Metric({ label, value, color, theme }: any) {
  return <View style={[styles.metricCard, { backgroundColor: theme.soft }]}><View style={[styles.metricDot, { backgroundColor: color }]} /><Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text></View>;
}

function ActionRow({ icon, color, title, subtitle, onPress, theme }: any) {
  return <TouchableOpacity onPress={onPress} style={[styles.actionRow, { backgroundColor: theme.card, borderColor: theme.border }]}><View style={[styles.actionIcon, { backgroundColor: `${color}20` }]}><MaterialCommunityIcons name={icon} size={22} color={color} /></View><View style={{ flex: 1 }}><Text style={[styles.actionTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.actionSub, { color: theme.muted }]}>{subtitle}</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={theme.muted} /></TouchableOpacity>;
}

function QuestionNavigator({ open, setOpen, questions, answers, flagged, confidence, currentIndex, goToQuestion, theme, panelBg, color }: any) {
  return <Modal visible={open} transparent animationType="slide"><View style={styles.modalOverlay}><TouchableOpacity style={styles.modalCloseArea} onPress={() => setOpen(false)} /><View style={[styles.navigatorSheet, { backgroundColor: panelBg, borderColor: theme.border }]}><View style={styles.sheetHandle} /><View style={styles.navigatorHeader}><Text style={[styles.navigatorTitle, { color: theme.text }]}>Question Navigator</Text><TouchableOpacity onPress={() => setOpen(false)}><MaterialCommunityIcons name="close" size={25} color={theme.text} /></TouchableOpacity></View><View style={styles.navigatorStats}>
            <NavigatorStat label="Answered" value={questions.filter((q: Question) => answers[q.id]).length} color="#22C55E" theme={theme} />
            <NavigatorStat label="Flagged" value={questions.filter((q: Question) => flagged[q.id]).length} color="#F97316" theme={theme} />
            <NavigatorStat label="Confidence" value={questions.filter((q: Question) => confidence?.[q.id]).length} color="#8B5CF6" theme={theme} />
          </View><View style={styles.legendRow}><Legend color="#22C55E" label="Answered" theme={theme} /><Legend color="#F97316" label="Flagged" theme={theme} /><Legend color={theme.muted} label="Unanswered" theme={theme} /></View><ScrollView style={styles.navigatorGridScroll} contentContainerStyle={styles.navigatorGrid} showsVerticalScrollIndicator={false}>{questions.map((q: Question, index: number) => { const answered = !!answers[q.id]; const isFlagged = !!flagged[q.id]; const active = currentIndex === index; const bg = active ? color : answered ? "#22C55E" : isFlagged ? "#F97316" : theme.soft; const textColor = active || answered || isFlagged ? "#FFFFFF" : theme.text; return <TouchableOpacity key={q.id} onPress={() => goToQuestion(index)} style={[styles.questionDot, { backgroundColor: bg, borderColor: active ? color : theme.border }]}><Text style={[styles.questionDotText, { color: textColor }]}>{index + 1}</Text></TouchableOpacity>; })}</ScrollView></View></View></Modal>;
}

function NavigatorStat({ label, value, color, theme }: any) {
  return (
    <View style={[styles.navigatorStat, { backgroundColor: theme.soft }]}>
      <Text style={[styles.navigatorStatValue, { color }]}>{value}</Text>
      <Text style={[styles.navigatorStatLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

function Legend({ color, label, theme }: any) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={[styles.legendText, { color: theme.muted }]}>{label}</Text></View>;
}


/**
 * The course list is its own component so `useCollapse` mounts and unmounts
 * with the ScrollView it drives. Called from the parent, the hook stayed
 * alive on all seven screens while its ref was only ever attached on this
 * one — which is what produced Reanimated's "animatedRef is not initialized
 * in useScrollOffset" warning on every other screen.
 */
function CoursesScreen({
  theme,
  isDark,
  insets,
  courses,
  savedSession,
  onResume,
  onDiscard,
  onOpenCourse,
}: {
  theme: Theme;
  isDark: boolean;
  insets: { top: number };
  courses: Course[];
  savedSession: any;
  onResume: () => void;
  onDiscard: () => void;
  onOpenCourse: (course: Course) => void;
}) {
  const { scrollRef, titleStyle, sublineStyle, fadeStyle, containerStyle } =
    useCollapse();

  return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        {/* Continuously scroll-linked, not a threshold flip: every value
            below is derived from the live offset, so the header tracks the
            finger instead of snapping at one point. */}
        <Reanimated.View
          style={[
            styles.practiceFixedTop,
            { backgroundColor: theme.bg },
            containerStyle,
          ]}
        >
          <View style={styles.headerRow}>
            <BackButton theme={theme} />

            <View style={styles.flex1}>
              {/* Scale rather than fontSize — a transform does not re-lay-out
                  the text on every frame of the scroll. */}
              <Reanimated.View style={[styles.titleWrap, titleStyle]}>
                <Text style={[styles.pageTitle, { color: theme.text }]}>Practice Mode</Text>
              </Reanimated.View>

              <Reanimated.View style={sublineStyle}>
                <Text style={[styles.pageSubline, { color: theme.muted }]}>
                  {courses.length} {courses.length === 1 ? "course" : "courses"} ready
                </Text>
              </Reanimated.View>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          <Reanimated.View
            pointerEvents="none"
            style={[styles.headerFade, fadeStyle]}
          >
            {FADE_STEPS.map((step, i) => (
              <View
                key={i}
                style={[styles.headerFadeBand, { backgroundColor: withAlpha(theme.bg, step) }]}
              />
            ))}
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.practiceCourseScroll}
        >
          {savedSession && (
            <Card
              theme={theme}
              tone={theme.accent}
              backgroundColor={theme.card}
              borderColor={theme.border}
              shadowColor={theme.shadow}
              radiusSize="lg"
              style={styles.resumePanel}
            >
              <View style={styles.resumeTop}>
                <IconPlate theme={theme} icon="history" color={theme.accent} size="md" />

                <View style={styles.flex1}>
                  <Text style={[styles.resumeTitle, { color: theme.text }]}>
                    Resume session
                  </Text>
                  <Text style={[styles.resumeSub, { color: theme.muted }]}>
                    {savedSession.selectedCourse?.code} · Question{" "}
                    {(savedSession.currentIndex || 0) + 1} of{" "}
                    {savedSession.questions?.length || 0}
                  </Text>
                </View>
              </View>

              <View style={styles.resumeActions}>
                <TouchableOpacity
                  onPress={onResume}
                  style={[styles.resumeBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.resumeBtnText, { color: theme.onAccent }]}>
                    Continue
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onDiscard}
                  style={[
                    styles.resumeBtn,
                    { backgroundColor: withAlpha(theme.accent, isDark ? 0.22 : 0.14) },
                  ]}
                >
                  <Text style={[styles.resumeBtnText, { color: theme.accent }]}>
                    Discard
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {courses.length === 0 ? (
            <EmptyState
              theme={theme}
              icon="book-search-outline"
              title="No assigned courses yet"
              text="No course matches your profile yet. Please check your department and level, then try again."
            />
          ) : (
            // A 2-up tile grid, deliberately NOT study's folder rows. Study
            // courses are containers you open; practice courses are targets
            // you start — so they get their own shape.
            <View style={styles.grid}>
              {courses.map((course) => {
                const courseTheme = getCourseTheme(course);

                return (
                  <Card
                    key={course.id}
                    onPress={() => onOpenCourse(course)}
                    theme={theme}
                    tone={courseTheme.color}
                    backgroundColor={theme.card}
                    borderColor={theme.border}
                    shadowColor={theme.shadow}
                    radiusSize="xl"
                    style={styles.courseCard}
                  >
                    <View style={styles.cardTop}>
                      <IconPlate
                        theme={theme}
                        icon={courseTheme.icon}
                        color={courseTheme.color}
                        size="md"
                      />

                      <View
                        style={[
                          styles.startDot,
                          { backgroundColor: withAlpha(courseTheme.color, isDark ? 0.28 : 0.18) },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="play"
                          size={14}
                          color={courseTheme.color}
                        />
                      </View>
                    </View>

                    <Text style={[styles.courseCode, { color: courseTheme.color }]}>
                      {course.code}
                    </Text>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>
                      {course.title}
                    </Text>
                    <Text style={[styles.cardMeta, { color: theme.muted }]}>
                      {course.level || "Level"}
                    </Text>
                  </Card>
                );
              })}
            </View>
          )}
        </Reanimated.ScrollView>
      </View>
    );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  headerSpacer: { width: 26 },
  // Anchored left so the shrink pulls the title toward the back button
  // rather than collapsing around its own centre.
  titleWrap: { alignSelf: "flex-start", transformOrigin: "left center" },
  confirmHero: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xxxl,
  },
  confirmStat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
  },
  confirmStatValue: { ...typeScale.hero },
  confirmStatLabel: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  confirmDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    minHeight: 44,
  },
  secondaryText: { ...typeScale.body, fontWeight: weight.medium },
  fieldInput: {
    flex: 1,
    ...typeScale.bodyLg,
    fontWeight: weight.medium,
    textAlign: "right",
    // Android gives TextInput intrinsic padding that would break the row height.
    paddingVertical: 0,
  },
  pageSubline: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  scoreHero: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
  },
  headlineRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xxxl,
    paddingHorizontal: spacing.xs,
  },
  headlineValue: {
    ...typeScale.title,
  },
  headlineLabel: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  resultButtonText: {
    ...typeScale.body,
    fontWeight: weight.bold,
  },
  headerFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -FADE_HEIGHT,
    height: FADE_HEIGHT,
  },
  headerFadeBand: { flex: 1 },
  startDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  optionsWrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 30 + spacing.md,
  },
  optionBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBadgeText: {
    ...typeScale.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
  },
  screen: { flex: 1 }, engineScreen: { flex: 1 },
  // paddingTop comes from the safe-area inset at the call site; a fixed 48
  // sat too low on notched devices and too high on flat ones.
  scroll: { paddingHorizontal: layout.screenGutter, paddingBottom: layout.tabBarInset },
  practiceFixedTop: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 18,
    zIndex: 10,
  },
  practiceCourseScroll: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  loadingCard: { margin: 24, marginTop: 180, borderWidth: 1, borderRadius: 30, padding: 30, alignItems: "center" },
  loadingTitle: { fontSize: 22, fontWeight: "900", marginTop: 18, textAlign: "center" },
  loadingSub: { fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 21 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 22, alignSelf: "flex-start" },
  backIconWrap: { width: 38, height: 38, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  backText: { fontWeight: "900", fontSize: 14 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  pageTitle: { ...typeScale.display },
  pageSub: { fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  resumePanel: { padding: spacing.lg, marginBottom: spacing.xl },
  resumeTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  resumeTitle: { fontSize: 17, fontWeight: "900" },
  resumeSub: { fontSize: 12, marginTop: 3 },
  resumeActions: { flexDirection: "row", gap: 10 },
  resumeBtn: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  resumeBtnText: { color: "#FFFFFF", fontWeight: "900" },
  // Layout only. Card owns radius, border and elevation — leaving them here
  // meant this style overrode the toned treatment and stacked a hardcoded
  // black shadow on top of it, which is what made light mode look boxed.
  courseCard: { width: "48%", minHeight: 176, padding: spacing.lg },
  cardGlow: { position: "absolute", width: 145, height: 145, borderRadius: 75, right: -66, top: -66, opacity: 0.72 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  iconBox: { width: 56, height: 56, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  courseCode: { fontSize: 13, fontWeight: "900" },
  cardTitle: { ...typeScale.bodyLg, fontWeight: weight.semi, marginTop: spacing.xs },
  cardMeta: { fontSize: 12, marginTop: 9, lineHeight: 18, fontWeight: "700" },
  list: { gap: 14 },
  topicCard: { padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  smallIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topicTitle: { ...typeScale.bodyLg, fontWeight: weight.semi },
  topicDesc: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  setupPanel: { borderWidth: 1, borderRadius: 32, padding: 24 },
  setupTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  setupTitle: { fontSize: 25, fontWeight: "900" },
  setupSub: { fontSize: 13, marginTop: 5, lineHeight: 19 },
  ruleCard: { borderRadius: 20, padding: 15, flexDirection: "row", gap: 10, marginBottom: 22 },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 19 },
  fieldLabel: { fontSize: 15, fontWeight: "900", marginBottom: 10 },
  inputBox: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, height: 58, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  input: { flex: 1, fontSize: 16, fontWeight: "800" },
  timeRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  timeInputBox: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, height: 70, justifyContent: "center" },
  timeInput: { fontSize: 20, fontWeight: "900", padding: 0 },
  timeLabel: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  toggleLabel: { fontSize: 15, fontWeight: "800" },
  toggleBox: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  summaryStrip: { borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 18 },
  summaryStripText: { fontWeight: "900" },
  primaryButton: { borderRadius: 18, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },

  confirmPanel: { borderWidth: 1, borderRadius: 32, padding: 24 },
  confirmIcon: { width: 70, height: 70, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  confirmTitle: { fontSize: 27, fontWeight: "900" },
  confirmSub: { fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 20 },
  confirmRows: { gap: 12, marginBottom: 22 },
  confirmRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  confirmLabel: { fontSize: 13, fontWeight: "800" },
  confirmValue: { flex: 1, textAlign: "right", fontSize: 14, fontWeight: "900" },
  confidenceRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  confidenceChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  confidenceText: { fontSize: 11, fontWeight: "800" },
  navigatorStats: { flexDirection: "row", gap: 10, marginBottom: 16 },
  navigatorStat: { flex: 1, borderRadius: 16, padding: 12 },
  navigatorStatValue: { fontSize: 18, fontWeight: "900" },
  navigatorStatLabel: { fontSize: 10, fontWeight: "800", marginTop: 2 },
  engineTopBar: { paddingTop: 42, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  circleBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  engineCourse: { fontSize: 17, fontWeight: "900" },
  engineTopic: { fontSize: 12, marginTop: 2 },
  timerPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  timerText: { fontSize: 12, fontWeight: "900" },
  engineTools: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  toolBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  submitSmall: { marginLeft: "auto", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  submitSmallText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden", marginHorizontal: 20 },
  progressFill: { height: "100%", borderRadius: 999 },
  engineScroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 230 },
  questionHeader: { flexDirection: "row", alignItems: "baseline", marginBottom: 18, gap: 6 },
  questionCounter: { fontSize: 18, fontWeight: "900" },
  questionTotal: { fontSize: 13, fontWeight: "800" },
  questionText: { fontSize: 21, fontWeight: "900", lineHeight: 31, marginBottom: 24 },
  optionRow: { borderWidth: 1, borderRadius: 22, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  optionRadio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#FFFFFF" },
  optionLetter: { fontSize: 16, fontWeight: "900" },
  optionText: { flex: 1, fontSize: 15, lineHeight: 22 },
  bottomNav: { position: "absolute", bottom: 92, left: 12, right: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderRadius: 26, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 12 },
  navText: { fontWeight: "900" },
  questionNavBtn: { borderWidth: 1, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18 },
  nextBtn: { marginLeft: "auto", borderRadius: 999, paddingHorizontal: 20, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 4 },
  nextText: { color: "#FFFFFF", fontWeight: "900" },
  reportPanel: { borderWidth: 1, borderRadius: 34, padding: 24, marginBottom: 18 },
  reportTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  reportTitle: { fontSize: 24, fontWeight: "900", marginTop: 5 },
  bandPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  bandText: { fontSize: 11, fontWeight: "900" },
  scoreBlock: { alignItems: "center", marginBottom: 14 },
  percentText: { fontSize: 64, fontWeight: "900" },
  accuracyText: { fontSize: 14, fontWeight: "800", marginTop: -4 },
  resultTrack: { height: 10, borderRadius: 999, overflow: "hidden", marginBottom: 16 },
  resultFill: { height: "100%", borderRadius: 999 },
  bandNote: { textAlign: "center", fontSize: 14, lineHeight: 21, marginBottom: 18 },
  resultGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48%", borderRadius: 22, padding: 15 },
  metricDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 10 },
  metricValue: { fontSize: 22, fontWeight: "900" },
  metricLabel: { fontSize: 12, fontWeight: "800", marginTop: 2 },
  xpLine: { marginTop: 16, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "#8B5CF622", flexDirection: "row", alignItems: "center", gap: 8 },
  xpLineText: { color: "#8B5CF6", fontWeight: "900", fontSize: 13 },
  actionList: { gap: 12 },
  actionRow: { borderWidth: 1, borderRadius: 24, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  actionIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 16, fontWeight: "900" },
  actionSub: { fontSize: 12, marginTop: 3 },
  resultButtons: { flexDirection: "row", gap: 12 },
  resultButton: { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  questionLabel: { fontSize: 12, fontWeight: "900" },
  // flex:1 is load-bearing — without it the text takes its natural width and
  // pushes the trailing status icon outside the card.
  // Parked offscreen purely so ViewShot has something laid out to capture.
  // Sized by its content now — the card owns its own fixed width.
  hiddenShareWrap: { position: "absolute", left: -9999, top: 0 },
  navigatorGridScroll: { maxHeight: 330 },
  emptyCard: { borderWidth: 1, borderRadius: 30, padding: 26, alignItems: "center", justifyContent: "center", minHeight: 210 },
  emptyTitle: { marginTop: 14, fontSize: 18, fontWeight: "900", textAlign: "center" },
  emptyText: { marginTop: 7, fontSize: 13, lineHeight: 20, fontWeight: "700", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalCloseArea: { flex: 1 },
  navigatorSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  sheetHandle: { width: 50, height: 5, borderRadius: 999, backgroundColor: "#94A3B8", alignSelf: "center", marginBottom: 18 },
  navigatorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  navigatorTitle: { fontSize: 21, fontWeight: "900" },
  legendRow: { flexDirection: "row", gap: 14, marginBottom: 18 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: "800" },
  navigatorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  questionDot: { width: 44, height: 44, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  questionDotText: { fontWeight: "900" },
});