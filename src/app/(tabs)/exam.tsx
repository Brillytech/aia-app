import { MaterialCommunityIcons } from "@expo/vector-icons";
// TODO: Enable when app is ready for production.
// import * as ScreenCapture from "expo-screen-capture";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
// Reanimated under its own name: this file already uses RN's Animated for its
// fade/slide values, and the CSS-transition props are Reanimated-only.
import Reanimated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import { supabase } from "../../../lib/supabase";
import { useScreenTime } from "../../screen-time";
import { category, Theme, useThemeMode } from "../../theme";
import { useContentInset } from "../../ui/layout/breakpoints";
import { AlertModal } from "../../ui/AlertModal";
import type { AlertType } from "../../theme";
import type { IconName } from "../../ui/alerts";
import { formatShareDate, ResultShareCard } from "../../ui/ResultShareCard";
import { buildReviewOptions, ReviewPager } from "../../ui/ReviewPager";
import { copyToClipboard, dataUrlToBlob, safeFileName, shareOrDownloadBlob, waitForFonts } from "../../ui/share-file";
import { Card } from "../../ui/Card";
import { haptics } from "../../ui/haptics";
import { IconPlate } from "../../ui/IconPlate";
import { dividerInset, ListRow, ListSection } from "../../ui/List";
import { Stepper } from "../../ui/Stepper";
import { subjectColor, subjectIcon } from "../../ui/subject";
import {
  layout,
  radius,
  spacing,
  type as typeScale,
  weight,
  withAlpha,
} from "../../ui/tokens";
import { useCollapse } from "../../ui/useCollapse";

const logo = require("../../../assets/ls-logo.png");

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
  topic_id?: string | null;
  topic_title?: string | null;
  topics?: {
    id?: string | null;
    title?: string | null;
  } | null;
  difficulty?: string | null;
};

type ExamScreen = "setup" | "preparing" | "exam" | "result" | "review";

type ExamPromptConfig = {
  title: string;
  message: string;
  tone?: "info" | "warning" | "danger";
  primaryText: string;
  secondaryText?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
};

const fallbackCourses: Course[] = [
  {
    id: "demo-ana",
    code: "ANA201",
    title: "Gross Anatomy",
    department: "Medicine",
    level: "200 Level",
  },
  {
    id: "demo-phys",
    code: "PHS201",
    title: "Physiology",
    department: "Medicine",
    level: "200 Level",
  },
  {
    id: "demo-cvs",
    code: "CVS",
    title: "Cardiovascular System",
    department: "Medicine",
    level: "200 Level",
  },
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
    topic_title: "Heart Anatomy",
    difficulty: "Basic",
  },
  {
    id: "q2",
    question:
      "Which valve is located between the left atrium and left ventricle?",
    option_a: "Tricuspid valve",
    option_b: "Mitral valve",
    option_c: "Pulmonary valve",
    option_d: "Aortic valve",
    correct_answer: "B",
    explanation: "The mitral valve is also called the bicuspid valve.",
    topic_title: "Heart Anatomy",
    difficulty: "Basic",
  },
  {
    id: "q3",
    question:
      "Which vessel carries blood from the right ventricle to the lungs?",
    option_a: "Aorta",
    option_b: "Pulmonary artery",
    option_c: "Pulmonary vein",
    option_d: "Superior vena cava",
    correct_answer: "B",
    explanation:
      "The pulmonary artery carries deoxygenated blood from the right ventricle to the lungs.",
    topic_title: "Great Vessels",
    difficulty: "Intermediate",
  },
];

function formatTime(totalSeconds: number) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getQuestionTopicTitle(q: Question) {
  const joinedTopicTitle = Array.isArray((q as any).topics)
    ? (q as any).topics?.[0]?.title
    : (q as any).topics?.title;

  return (
    q.topic_title ||
    joinedTopicTitle ||
    (q.topic_id ? "Untitled Topic" : "General")
  );
}

function getGrade(score: number) {
  if (score >= 70) return { label: "Excellent", color: "#22C55E" };
  if (score >= 60) return { label: "Good", color: "#3B82F6" };
  if (score >= 50) return { label: "Fair", color: "#F97316" };
  return { label: "Needs Improvement", color: "#EF4444" };
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
  const departmentMatch = sameProfileValue(assignment.department, profile?.department);
  const levelMatch = sameLevel(assignment.level, profile?.level);

  return schoolMatch && departmentMatch && levelMatch;
}

function getWeekStartIso(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);

  current.setDate(diff);
  current.setHours(0, 0, 0, 0);

  return current.toISOString();
}

function calculateExamXp(scorePercent: number, correct: number, total: number) {
  const completionBonus = total > 0 ? 35 : 0;
  const gradeBonus =
    scorePercent >= 80 ? 80 : scorePercent >= 70 ? 55 : scorePercent >= 60 ? 35 : scorePercent >= 50 ? 15 : 0;

  return Math.max(0, correct * 12 + completionBonus + gradeBonus);
}
/** Shim over the shared resolver, keeping the existing call shape. */
function getCourseTheme(course?: Course | null) {
  return { icon: subjectIcon(course), color: subjectColor(course) };
}

export default function Exam() {
  const contentInset = useContentInset();
  const { theme, isDark } = useThemeMode();

  const [screen, setScreen] = useState<ExamScreen>("setup");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [questionCountInput, setQuestionCountInput] = useState("50");
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(60 * 60);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [examPrompt, setExamPrompt] = useState<ExamPromptConfig | null>(null);

  const [loading, setLoading] = useState(true);
  const [preparingProgress, setPreparingProgress] = useState(0);

  // Setup, the exam itself, and the review afterwards all count. Exams carry
  // no topic, matching how this screen already writes its attempt rows.
  useScreenTime("exam", selectedCourse?.id);

  /** Shown on the shared result card, so it is credited to a person. */
  const [shareUsername, setShareUsername] = useState("LASU Scholar student");
  const resultCardRef = useRef<any>(null);

  // Picking a course is step one of three on this screen, and the other two
  // sit below the fold on most phones — so choosing one used to look like
  // nothing happened. Selecting now carries you to the settings it unlocks.
  const setupScrollRef = useRef<ScrollView>(null);
  const formatSectionY = useRef(0);

  function chooseCourse(course: Course) {
    haptics.select();
    setSelectedCourse(course);

    // One frame, so the row's selected state paints before the scroll starts
    // — otherwise the movement reads as the list jumping on its own.
    requestAnimationFrame(() => {
      setupScrollRef.current?.scrollTo({
        y: Math.max(0, formatSectionY.current - spacing.md),
        animated: true,
      });
    });
  }

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const resultFade = useRef(new Animated.Value(0)).current;
  const resultLift = useRef(new Animated.Value(18)).current;

  // These were exam's own three-surface palette. `bg` is where the shared
  // dark base (#050B16) came from; the other two now resolve through the
  // theme so this screen stops being the last one with local colours.
  const bg = theme.bg;
  const paper = theme.card;
  const panel = theme.cardSoft;
  const line = theme.border;
  const text = theme.text;
  const muted = theme.muted;
  const accent = theme.accent;
  const selectedCourseTheme = getCourseTheme(selectedCourse);

  useEffect(() => {
    init();
  }, []);

  // TODO: Enable this back when the app is ready for production.
  // This blocks screenshots/screen recording on Exam Mode.
  //
  // useEffect(() => {
  //   ScreenCapture.preventScreenCaptureAsync("exam-screen");
  //
  //   return () => {
  //     ScreenCapture.allowScreenCaptureAsync("exam-screen");
  //   };
  // }, []);

  useEffect(() => {
    if (screen !== "exam") return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          autoSubmit();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [screen]);

  async function init() {
    await loadCourses();
  }

  async function loadCourses() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setCourses([]);
      setSelectedCourse(null);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school, faculty, department, level, username, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.username || profile?.full_name) {
      setShareUsername(profile.username || profile.full_name);
    }

    if (profileError || !profile?.school || !profile?.department || !profile?.level) {
      console.log("EXAM PROFILE ERROR:", profileError?.message);
      setCourses([]);
      setSelectedCourse(null);
      setLoading(false);
      return;
    }

    const profileFaculty = profile.school === "LASUCOM" ? "College of Medicine" : profile.faculty;

    const { data: control, error: controlError } = await supabase
      .from("app_period_controls")
      .select("live_period_id")
      .eq("school", profile.school)
      .eq("department", profile.department)
      .eq("level", profile.level)
      .maybeSingle();

    if (controlError) {
      console.log("EXAM LIVE PERIOD CONTROL ERROR:", controlError.message);
      setCourses([]);
      setSelectedCourse(null);
      setLoading(false);
      return;
    }

    const livePeriodId = control?.live_period_id;

    if (!livePeriodId) {
      setCourses([]);
      setSelectedCourse(null);
      setLoading(false);
      return;
    }

    let ownedQuery = supabase
      .from("courses")
      .select("id, code, title, semester, status, school, faculty, department, level, academic_period_id, course_icon, course_color")
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
          .select(`
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
          `)
          .eq("school", profile.school)
          .eq("department", profile.department)
          .eq("level", profile.level)
          .eq("academic_period_id", livePeriodId),
      ]);

    if (ownedError) console.log("EXAM OWNED COURSES ERROR:", ownedError.message);
    if (sharedError) console.log("EXAM SHARED COURSES ERROR:", sharedError.message);

    const directCourses = (ownedCourses || []).map((course: any) => ({ ...course, is_shared: false })) as Course[];

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
    setSelectedCourse(uniqueCourses[0] || null);
    setLoading(false);
  }

  function getQuestionLimit() {
    const parsed = Number(questionCountInput);
    if (!Number.isFinite(parsed) || parsed < 1) return 50;
    return Math.min(Math.floor(parsed), 500);
  }

  function increaseTime() {
    setDurationMinutes((prev) => Math.min(prev + 5, 300));
  }

  function decreaseTime() {
    setDurationMinutes((prev) => Math.max(prev - 5, 5));
  }

  function increaseQuestions() {
    const next = Math.min(getQuestionLimit() + 5, 500);
    setQuestionCountInput(String(next));
  }

  function decreaseQuestions() {
    const next = Math.max(getQuestionLimit() - 5, 1);
    setQuestionCountInput(String(next));
  }

  async function startPreparing() {
    if (!selectedCourse) {
      setExamPrompt({
        title: "Course Required",
        message: "Select a course before starting the examination.",
        tone: "warning",
        primaryText: "Select Course",
        onPrimary: () => setExamPrompt(null),
      });
      return;
    }

    setScreen("preparing");
    setPreparingProgress(0);

    const steps = [18, 42, 67, 86, 100];
    steps.forEach((value, index) => {
      setTimeout(() => setPreparingProgress(value), 260 * (index + 1));
    });

    setTimeout(beginExam, 1500);
  }

  async function beginExam() {
    if (!selectedCourse) return;

    const limit = getQuestionLimit();
    const duration = durationMinutes * 60;

    setAnswers({});
    setFlagged({});
    setCurrentIndex(0);
    setSecondsLeft(duration);
    setStartedAt(Date.now());

    let loadedQuestions: Question[] = [];

    if (!isUuid(selectedCourse.id)) {
      loadedQuestions = fallbackQuestions.slice(0, limit);
    } else {
      const { data, error } = await supabase
        .from("questions")
        .select(
          `
          *,
          topics (
            id,
            title
          )
        `
        )
        .eq("course_id", selectedCourse.id)
        .limit(limit);

      if (error) {
        console.log("EXAM QUESTIONS ERROR:", error.message);
        loadedQuestions = [];
      } else {
        loadedQuestions = (data || []).map((item: any) => {
          const topic = Array.isArray(item.topics) ? item.topics[0] : item.topics;

          return {
            ...item,
            topic_title: item.topic_title || topic?.title || null,
          } as Question;
        });
      }
    }

    if (loadedQuestions.length === 0) {
      setScreen("setup");
      setExamPrompt({
        title: "No Questions Yet",
        message: "No exam questions have been added for this course yet.",
        tone: "info",
        primaryText: "Okay",
        onPrimary: () => setExamPrompt(null),
      });
      return;
    }

    loadedQuestions = [...loadedQuestions].sort(() => Math.random() - 0.5);

    setQuestions(loadedQuestions);
    setScreen("exam");
    animateQuestion();
  }

  function animateQuestion() {
    fade.setValue(0);
    slide.setValue(10);

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function chooseAnswer(id: string, answer: string) {
    setAnswers((prev) => ({
      ...prev,
      [id]: answer,
    }));
  }

  function toggleFlag(id: string) {
    setFlagged((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function goToQuestion(index: number) {
    setNavigatorOpen(false);
    setCurrentIndex(index);
    setTimeout(animateQuestion, 20);
  }

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setTimeout(animateQuestion, 20);
    }
  }

  function previousQuestion() {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setTimeout(animateQuestion, 20);
    }
  }

  const correct = useMemo(() => {
    return questions.reduce((total, q) => {
      return answers[q.id] === q.correct_answer.toUpperCase()
        ? total + 1
        : total;
    }, 0);
  }, [answers, questions]);

  const unanswered = questions.filter((q) => !answers[q.id]).length;
  const answered = questions.length - unanswered;
  const wrong = questions.length - correct - unanswered;
  const scorePercent =
    questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
  const timeUsed = startedAt
    ? Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
    : 0;
  const grade = getGrade(scorePercent);
  const examXp = calculateExamXp(scorePercent, correct, questions.length);

  const topicBreakdown = useMemo(() => {
    const map: Record<
      string,
      { topic: string; total: number; correct: number }
    > = {};

    questions.forEach((q) => {
      const topic = getQuestionTopicTitle(q);
      if (!map[topic]) map[topic] = { topic, total: 0, correct: 0 };
      map[topic].total += 1;
      if (answers[q.id] === q.correct_answer.toUpperCase())
        map[topic].correct += 1;
    });

    return Object.values(map).sort((a, b) => {
      const aPercent = a.total > 0 ? a.correct / a.total : 0;
      const bPercent = b.total > 0 ? b.correct / b.total : 0;

      if (aPercent !== bPercent) return aPercent - bPercent;

      return b.total - a.total;
    });
  }, [answers, questions]);

  const difficultyBreakdown = useMemo(() => {
    const map: Record<
      string,
      { difficulty: string; total: number; correct: number }
    > = {};

    questions.forEach((q) => {
      const difficulty = q.difficulty || "Mixed";
      if (!map[difficulty])
        map[difficulty] = { difficulty, total: 0, correct: 0 };
      map[difficulty].total += 1;
      if (answers[q.id] === q.correct_answer.toUpperCase())
        map[difficulty].correct += 1;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [answers, questions]);

  function submitExam() {
    setExamPrompt({
      title: "Submit Examination?",
      message: `Answered: ${answered}\nUnanswered: ${unanswered}\nFlagged: ${Object.values(flagged).filter(Boolean).length}`,
      tone: "danger",
      primaryText: "Submit Exam",
      secondaryText: "Continue Exam",
      onPrimary: () => {
        setExamPrompt(null);
        finishExam();
      },
      onSecondary: () => setExamPrompt(null),
    });
  }

  function autoSubmit() {
    setExamPrompt({
      title: "Time Expired",
      message: "This examination has been submitted automatically.",
      tone: "warning",
      primaryText: "View Result",
      onPrimary: () => setExamPrompt(null),
    });
    finishExam();
  }

  async function finishExam() {
    setScreen("result");
    await saveExamAttempt();
    animateResult();
  }

  async function saveExamAttempt() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user || !selectedCourse || !isUuid(selectedCourse.id)) return;

    // Answered, not the session size — see the matching note in practice.
    await supabase.from("user_progress").insert({
      user_id: user.id,
      course_id: selectedCourse.id,
      topic_id: null,
      questions_studied: correct + wrong,
      questions_correct: correct,
      materials_opened: 0,
      progress_percent: scorePercent,
    });

    const { data: attempt, error: attemptError } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: user.id,
        course_id: selectedCourse.id,
        score_percent: scorePercent,
        correct_answers: correct,
        wrong_answers: wrong,
        unanswered,
        total_questions: questions.length,
        time_used_seconds: timeUsed,
        xp_earned: examXp,
      })
      .select("id")
      .single();

    if (!attemptError && attempt) {
      const answerRows = questions.map((q) => {
        const selected = answers[q.id] || null;
        const correctAnswer = q.correct_answer.toUpperCase();

        return {
          attempt_id: attempt.id,
          user_id: user.id,
          question_id: q.id,
          selected_answer: selected,
          correct_answer: correctAnswer,
          is_correct: selected === correctAnswer,
        };
      });

      if (answerRows.length > 0) {
        await supabase.from("exam_answers").insert(answerRows);
      }

      const weekStart = getWeekStartIso();

      await supabase.from("xp_events").insert({
        user_id: user.id,
        source: "exam",
        source_id: attempt.id,
        xp: examXp,
        week_start: weekStart,
        description: `${selectedCourse.code} exam session`,
      });

      await supabase.from("user_activity_logs").insert({
        user_id: user.id,
        mode: "exam",
        course_id: selectedCourse.id,
        topic_id: null,
        // Zero, deliberately. `useScreenTime` is the single source of learning
        // time now; leaving `timeUsed` here would count the exam twice.
        duration_seconds: 0,
        xp_earned: examXp,
        accuracy_percent: scorePercent,
        correct_answers: correct,
        total_questions: questions.length,
        week_start: weekStart,
      });
    }
  }

  /**
   * Shares the rendered result card as an image. This used to post a wall of
   * plain text with the numbers typed into it — nobody shares a paragraph.
   * Falls back to text only if the capture fails or the OS has no share sheet.
   */
  async function shareExamResult() {
    const message = `I just scored ${scorePercent}% in ${selectedCourse?.code || "Exam Mode"} on LASU Scholar.

Grade: ${grade.label} · ${correct}/${questions.length} correct · ${formatTime(timeUsed)}

https://lasuscholar.com`;

    try {
      // See the note in practice.tsx: the icon font must be loaded before
      // html2canvas captures, or the card's glyphs render blank.
      await waitForFonts();

      const uri = await resultCardRef.current?.capture?.();

      if (!uri) {
        setExamPrompt({
          title: "Result Card Not Ready",
          message: "Please wait a moment and try sharing again.",
          tone: "warning",
          primaryText: "OK",
          onPrimary: () => setExamPrompt(null),
        });
        return;
      }

      const blob = await dataUrlToBlob(uri);
      const fileName = `${safeFileName(selectedCourse?.code || "exam", "exam")}-result.png`;

      const outcome = await shareOrDownloadBlob(blob, fileName, {
        title: "LASU Scholar Exam Result",
        text: message,
      });

      // See the matching note in practice.tsx: nothing to add when the image
      // and caption left together, and the clipboard keeps them close when
      // they could not.
      if (outcome === "shared" || outcome === "cancelled") return;

      const copied = await copyToClipboard(message);

      setExamPrompt({
        title: outcome === "downloaded" ? "Result Card Saved" : "Result Card Shared",
        message: copied
          ? "Caption copied to your clipboard — just paste it with the image."
          : `Caption to paste with your image:\n\n${message}`,
        primaryText: "OK",
        onPrimary: () => setExamPrompt(null),
      });
    } catch (error) {
      console.log("EXAM SHARE ERROR:", error);

      setExamPrompt({
        title: "Could Not Share",
        message: "Something went wrong while preparing your result card.",
        tone: "danger",
        primaryText: "OK",
        onPrimary: () => setExamPrompt(null),
      });
    }
  }

  function animateResult() {
    resultFade.setValue(0);
    resultLift.setValue(18);

    Animated.parallel([
      Animated.timing(resultFade, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(resultLift, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }

  const currentQuestion = questions[currentIndex];

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: bg }]}>
        <View style={[styles.loadingBlock, { borderColor: line }]}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[styles.loadingTitle, { color: text }]}>
            Opening exam mode
          </Text>
          <Text style={[styles.loadingSub, { color: muted }]}>
            Fetching available courses.
          </Text>
        </View>
      </View>
    );
  }

  if (screen === "setup") {
    return (
      <View style={[styles.screen, { backgroundColor: bg }]}> 
        <View style={[styles.examSetupFixedTop, { backgroundColor: bg }]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => {
                haptics.tap();
                router.back();
              }}
              hitSlop={12}
              style={styles.backGlyph}
            >
              <MaterialCommunityIcons name="chevron-left" size={26} color={text} />
            </Pressable>

            <View style={styles.flex1}>
              <Text style={[styles.title, { color: text }]}>Exam Mode</Text>
              <Text style={[styles.subtitle, { color: muted }]}>
                {courses.length} {courses.length === 1 ? "course" : "courses"} available
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          ref={setupScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.setupScrollFixed, contentInset]}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: text }]}>Course</Text>

            {courses.length === 0 ? (
              <EmptyState theme={theme} icon="file-search-outline" title="No assigned courses yet" text="No course matches your profile yet. Please check your department and level, then try again." />
            ) : (
              // Same selection model, toned per subject — the chosen course
              // now reads at a glance instead of via a 9%-alpha row tint.
              <View style={styles.courseList}>
                {courses.map((course) => {
                  const active = selectedCourse?.id === course.id;
                  const courseTheme = getCourseTheme(course);

                  return (
                    <Card
                      key={course.id}
                      onPress={() => chooseCourse(course)}
                      theme={theme}
                      tone={active ? courseTheme.color : undefined}
                      backgroundColor={paper}
                      borderColor={line}
                      shadowColor={theme.shadow}
                      radiusSize="lg"
                      elevationLevel={active ? 0 : 1}
                      style={styles.courseFlatRow}
                    >
                      <IconPlate
                        theme={theme}
                        icon={courseTheme.icon}
                        color={courseTheme.color}
                        size="md"
                      />

                      <View style={styles.flex1}>
                        <Text
                          style={[
                            styles.courseCode,
                            { color: active ? courseTheme.color : text },
                          ]}
                        >
                          {course.code}
                        </Text>
                        <Text style={[styles.courseName, { color: text }]}>
                          {course.title}
                        </Text>
                        <Text style={[styles.courseMeta, { color: muted }]}>
                          {course.department || "Department"} • {course.level || "Level"}
                        </Text>
                      </View>

                      <MaterialCommunityIcons
                        name={active ? "check-circle" : "circle-outline"}
                        size={22}
                        color={active ? courseTheme.color : withAlpha(muted, 0.5)}
                      />
                    </Card>
                  );
                })}
              </View>
            )}
          </View>

          {/* Steppers now use the shared control, so exam, practice and any
              future numeric field behave identically. The wrapper exists to
              record where this block starts, which is the scroll target after
              a course is picked. */}
          <View
            onLayout={(event) => {
              formatSectionY.current = event.nativeEvent.layout.y;
            }}
          >
            <ListSection theme={theme} title="Format" inset={dividerInset.none}>
              <ListRow
                theme={theme}
                label="Questions"
                accessory={
                  <Stepper
                    theme={theme}
                    color={selectedCourseTheme.color}
                    value={questionCountInput}
                    onChangeText={setQuestionCountInput}
                    step={5}
                    min={1}
                    max={200}
                  />
                }
              />

              <ListRow
                theme={theme}
                label="Duration"
                value="minutes"
                accessory={
                  <Stepper
                    theme={theme}
                    color={selectedCourseTheme.color}
                    value={String(durationMinutes)}
                    onChangeText={(next) => setDurationMinutes(Number(next) || 0)}
                    step={5}
                    min={5}
                    max={240}
                  />
                }
              />
            </ListSection>
          </View>

          {/* The paragraph went — it described the two facts already stated
              below it. Pool and Submit are real config and stay. */}
          <ListSection theme={theme} title="Rules" inset={dividerInset.none} plain>
            <ListRow theme={theme} label="Question pool" value="All topics" chevron={false} />
            <ListRow theme={theme} label="On time up" value="Auto-submit" chevron={false} />
          </ListSection>

          <TouchableOpacity
            onPress={startPreparing}
            style={[styles.startButton, { backgroundColor: selectedCourseTheme.color }]}
          >
            <Text style={[styles.startButtonText, { color: theme.onAccent }]}>
              Begin examination
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={22} color={theme.onAccent} />
          </TouchableOpacity>
        </ScrollView>

        <ExamPrompt config={examPrompt} theme={theme} onClose={() => setExamPrompt(null)} />
      </View>
    );
  }

  if (screen === "preparing") {
    return (
      <View style={[styles.screen, { backgroundColor: bg }]}>
        <View style={styles.preparingTop}>
          <TouchableOpacity
            onPress={() => setScreen("setup")}
            style={styles.backButton}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={text} />
            <Text style={[styles.backText, { color: text }]}>Exam Setup</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.preparingCenter}>
          <Text style={[styles.preparingTitle, { color: text }]}>
            Preparing Examination
          </Text>

          <View style={[styles.progressRing, { borderColor: `${accent}33` }]}>
            <Text style={[styles.progressPercent, { color: accent }]}>
              {preparingProgress}%
            </Text>
          </View>

          <View
            style={[
              styles.prepareBar,
              { backgroundColor: isDark ? "#1E293B" : "#E5E7EB" },
            ]}
          >
            <View
              style={[
                styles.prepareFill,
                { width: `${preparingProgress}%`, backgroundColor: accent },
              ]}
            />
          </View>

          <Text style={[styles.prepareNote, { color: muted }]}>
            Loading question pool and generating exam session.
          </Text>
        </View>
      </View>
    );
  }

  if (screen === "exam" && currentQuestion) {
    const options = [
      ["A", currentQuestion.option_a],
      ["B", currentQuestion.option_b],
      ["C", currentQuestion.option_c],
      ["D", currentQuestion.option_d],
      ["E", currentQuestion.option_e],
    ].filter(([, value]) => value);

    const timerColor =
      secondsLeft <= 300 ? "#EF4444" : secondsLeft <= 600 ? "#F97316" : accent;

    return (
      <View style={[styles.examScreen, { backgroundColor: bg }]}>
        <View
          style={[
            styles.examHeader,
            { borderBottomColor: line, backgroundColor: paper },
          ]}
        >
          <Text style={[styles.examCourse, { color: text }]}>
            {selectedCourse?.code}
          </Text>
          <Text style={[styles.examCount, { color: muted }]}>
            Question {currentIndex + 1} / {questions.length}
          </Text>
          <View style={[styles.timerPill, { borderColor: timerColor }]}>
            <MaterialCommunityIcons
              name="timer-outline"
              size={17}
              color={timerColor}
            />
            <Text style={[styles.timerText, { color: timerColor }]}>
              {formatTime(secondsLeft)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.paletteStrip,
            { borderBottomColor: line, backgroundColor: bg },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paletteInline}
          >
            {questions.map((q, index) => {
              const isCurrent = index === currentIndex;
              const isAnswered = !!answers[q.id];
              const isFlagged = !!flagged[q.id];
              const fill = isCurrent
                ? accent
                : isFlagged
                  ? "#F97316"
                  : isAnswered
                    ? "#22C55E"
                    : "transparent";
              const color =
                isCurrent || isFlagged || isAnswered ? "#FFFFFF" : muted;

              return (
                <TouchableOpacity
                  key={q.id}
                  onPress={() => goToQuestion(index)}
                  style={[
                    styles.paletteSmall,
                    {
                      backgroundColor: fill,
                      borderColor: isCurrent ? accent : line,
                    },
                  ]}
                >
                  <Text style={[styles.paletteSmallText, { color }]}>
                    {index + 1}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={[styles.questionPaper, contentInset]}>
          <Animated.View
            style={{ opacity: fade, transform: [{ translateY: slide }] }}
          >
            <Text style={[styles.paperNo, { color: accent }]}>
              Question {currentIndex + 1}
            </Text>
            <Text style={[styles.paperQuestion, { color: text }]}>
              {currentQuestion.question}
            </Text>

            <View style={styles.optionsList}>
              {options.map(([letter, value]) => {
                const selected = answers[currentQuestion.id] === letter;

                return (
                  <TouchableOpacity
                    key={letter}
                    onPress={() =>
                      chooseAnswer(currentQuestion.id, letter as string)
                    }
                    style={[
                      styles.optionLine,
                      {
                        borderColor: selected ? accent : line,
                        backgroundColor: selected
                          ? `${accent}10`
                          : "transparent",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: selected ? accent : muted,
                          backgroundColor: selected ? accent : "transparent",
                        },
                      ]}
                    >
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.optionLetter, { color: accent }]}>
                      {letter}
                    </Text>
                    <Text style={[styles.optionText, { color: text }]}>
                      {value}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </ScrollView>

        <View
          style={[
            styles.examFooter,
            { backgroundColor: paper, borderTopColor: line },
          ]}
        >
          <TouchableOpacity
            disabled={currentIndex === 0}
            onPress={previousQuestion}
            style={[
              styles.footerBtn,
              { opacity: currentIndex === 0 ? 0.35 : 1 },
            ]}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={22}
              color={text}
            />
            <Text style={[styles.footerText, { color: text }]}>Previous</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleFlag(currentQuestion.id)}
            style={styles.footerBtn}
          >
            <MaterialCommunityIcons
              name={
                flagged[currentQuestion.id]
                  ? "flag-variant"
                  : "flag-variant-outline"
              }
              size={21}
              color={flagged[currentQuestion.id] ? "#F97316" : muted}
            />
            <Text
              style={[
                styles.footerText,
                { color: flagged[currentQuestion.id] ? "#F97316" : muted },
              ]}
            >
              Flag
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setNavigatorOpen(true)}
            style={styles.footerBtn}
          >
            <MaterialCommunityIcons
              name="view-grid-outline"
              size={21}
              color={muted}
            />
            <Text style={[styles.footerText, { color: muted }]}>Palette</Text>
          </TouchableOpacity>

          {currentIndex === questions.length - 1 ? (
            <TouchableOpacity
              onPress={submitExam}
              style={[styles.nextButton, { backgroundColor: "#EF4444" }]}
            >
              <Text style={styles.nextText}>Submit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={nextQuestion}
              style={[styles.nextButton, { backgroundColor: accent }]}
            >
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          )}
        </View>

        <ExamNavigator
          open={navigatorOpen}
          setOpen={setNavigatorOpen}
          questions={questions}
          answers={answers}
          flagged={flagged}
          currentIndex={currentIndex}
          goToQuestion={goToQuestion}
          theme={theme}
          paper={paper}
          accent={accent}
        />

        <ExamPrompt
          config={examPrompt}
          theme={theme}
          onClose={() => setExamPrompt(null)}
        />
      </View>
    );
  }

  if (screen === "result") {
    return (
      <View style={[styles.screen, { backgroundColor: bg }]}> 
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.resultScroll, contentInset]}>
          <Animated.View style={{ opacity: resultFade, transform: [{ translateY: resultLift }] }}>
            {/* Course identity first and quietly, then the score alone. The
                old hero boxed all of it together, so the percentage competed
                with an icon plate, a kicker and a share button. */}
            <View style={styles.resultCourse}>
              <Text style={[styles.resultCode, { color: selectedCourseTheme.color }]}>
                {selectedCourse?.code}
              </Text>
              <Text style={[styles.resultSub, { color: muted }]}>
                {selectedCourse?.title}
              </Text>
            </View>

            <View style={styles.scoreHero}>
              <Text style={[styles.scorePercent, { color: grade.color }]}>
                {scorePercent}%
              </Text>
              <Text style={[styles.scoreLabel, { color: muted }]}>Final score</Text>

              <View
                style={[
                  styles.gradePillBig,
                  { backgroundColor: withAlpha(grade.color, isDark ? 0.24 : 0.16) },
                ]}
              >
                <MaterialCommunityIcons name="medal-outline" size={18} color={grade.color} />
                <Text style={[styles.gradeText, { color: grade.color }]}>{grade.label}</Text>
              </View>

              <View style={[styles.resultTrack, { backgroundColor: theme.soft }]}>
                <View
                  style={[
                    styles.resultFill,
                    { width: `${scorePercent}%`, backgroundColor: grade.color },
                  ]}
                />
              </View>
            </View>

            <View style={styles.headlineRow}>
              <HeadlineStat theme={theme} label="Correct" value={String(correct)} color={theme.success} />
              <HeadlineStat theme={theme} label="Wrong" value={String(wrong)} color={theme.error} />
              <HeadlineStat theme={theme} label="Time" value={formatTime(timeUsed)} color={theme.info} />
            </View>

            <ListSection theme={theme} title="Summary" inset={dividerInset.none}>
              <ListRow theme={theme} label="Unanswered" value={String(unanswered)} chevron={false} />
              <ListRow theme={theme} label="XP earned" value={`+${examXp}`} chevron={false} />
            </ListSection>

            {/* Both breakdowns become real lists. BreakdownTable was a
                hand-rolled table with its own header row and borders. */}
            {topicBreakdown.length > 0 ? (
              <ListSection theme={theme} title="By topic" inset={dividerInset.none} plain>
                {topicBreakdown.map((row) => (
                  <ListRow
                    key={row.topic}
                    theme={theme}
                    label={row.topic}
                    value={`${row.correct}/${row.total}`}
                    progress={row.total > 0 ? (row.correct / row.total) * 100 : 0}
                    chevron={false}
                  />
                ))}
              </ListSection>
            ) : null}

            {difficultyBreakdown.length > 0 ? (
              <ListSection theme={theme} title="By difficulty" inset={dividerInset.none} plain>
                {difficultyBreakdown.map((row) => (
                  <ListRow
                    key={row.difficulty}
                    theme={theme}
                    label={row.difficulty}
                    value={`${row.correct}/${row.total}`}
                    progress={row.total > 0 ? (row.correct / row.total) * 100 : 0}
                    chevron={false}
                  />
                ))}
              </ListSection>
            ) : null}

            {/* Offscreen, purely so ViewShot has a laid-out tree to capture
                when Share is tapped. */}
            <View style={styles.hiddenShareWrap}>
              <ViewShot
                ref={resultCardRef}
                options={{ format: "png", quality: 1, result: "data-uri" }}
              >
                <ResultShareCard
                  theme={theme}
                  mode="Exam"
                  accent={selectedCourseTheme.color}
                  courseCode={selectedCourse?.code || "Exam"}
                  courseTitle={selectedCourse?.title}
                  username={shareUsername}
                  percent={scorePercent}
                  bandLabel={grade.label}
                  bandColor={grade.color}
                  correct={correct}
                  total={questions.length}
                  wrong={questions.length - correct}
                  timeLabel={formatTime(timeUsed)}
                  xp={examXp}
                  dateLabel={formatShareDate()}
                />
              </ViewShot>
            </View>

            {/* Share lives here only — it was also a circle button up in the
                hero, so the same action appeared twice on one screen. */}
            <ListSection theme={theme} title="Next">
              <ListRow theme={theme} icon="share-variant" label="Share result" onPress={shareExamResult} />
              <ListRow theme={theme} icon="clipboard-search-outline" label="Review answers" onPress={() => setScreen("review")} />
            </ListSection>

            <TouchableOpacity
              onPress={() => setScreen("setup")}
              style={[styles.startButton, { backgroundColor: selectedCourseTheme.color }]}
            >
              <Text style={[styles.startButtonText, { color: theme.onAccent }]}>
                Take another exam
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/dashboard")}
              style={styles.secondaryAction}
            >
              <Text style={[styles.secondaryActionText, { color: muted }]}>
                Back to dashboard
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
        <ExamPrompt config={examPrompt} theme={theme} onClose={() => setExamPrompt(null)} />
      </View>
    );
  }

  if (screen === "review") {
    return (
      <ReviewPager
        theme={theme}
        title="Answer review"
        onExit={() => setScreen("result")}
        items={questions.map((q) => ({
          id: q.id,
          question: q.question,
          topic: getQuestionTopicTitle(q),
          options: buildReviewOptions(q),
          correctKey: q.correct_answer.toUpperCase(),
          chosenKey: answers[q.id] || null,
          explanation: q.explanation,
        }))}
      />
    );
  }

  return null;
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

/**
 * The exam screen's prompts, now on the same bottom sheet every other screen
 * uses. `tone` predates the app-wide `AlertType`, so it is mapped rather than
 * renamed at all eleven call sites.
 */
const TONE_TO_ALERT_TYPE: Record<string, AlertType> = {
  danger: "error",
  warning: "warning",
  info: "info",
};

function ExamPrompt({
  config,
  theme,
  onClose,
}: {
  config: ExamPromptConfig | null;
  theme: Theme;
  onClose: () => void;
}) {
  return (
    <AlertModal
      theme={theme}
      visible={!!config}
      type={TONE_TO_ALERT_TYPE[config?.tone ?? "info"] ?? "info"}
      title={config?.title ?? ""}
      message={config?.message ?? ""}
      primaryLabel={config?.primaryText ?? "OK"}
      onPrimary={config?.onPrimary ?? onClose}
      secondaryLabel={config?.secondaryText}
      onSecondary={
        config?.secondaryText ? (config.onSecondary ?? onClose) : undefined
      }
      onRequestClose={onClose}
    />
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

function InfoMini({ label, value, theme }: any) {
  return (
    <View style={styles.infoMini}>
      <Text style={[styles.infoMiniLabel, { color: theme.muted }]}>
        {label}
      </Text>
      <Text style={[styles.infoMiniValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function ResultMetric({ label, value, color, theme }: any) {
  return (
    <View style={styles.resultMetric}>
      <View style={[styles.metricDot, { backgroundColor: color }]} />
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

function BreakdownTable({ title, rows, theme }: any) {
  if (!rows || rows.length === 0) return null;

  return (
    <View style={styles.breakdownBlock}>
      <Text style={[styles.breakdownTitle, { color: theme.text }]}>
        {title}
      </Text>

      {rows.map((row: any, index: number) => {
        const [correctRaw, totalRaw] = String(row.score).split("/");
        const correct = Number(correctRaw) || 0;
        const total = Number(totalRaw) || Number(row.total) || 1;
        const percent = Math.round((correct / total) * 100);
        const barColor =
          percent >= 70 ? "#22C55E" : percent >= 50 ? "#F97316" : "#EF4444";

        return (
          <View
            key={`${row.name}-${index}`}
            style={[styles.breakdownRow, { borderBottomColor: theme.border }]}
          >
            <View style={styles.breakdownTop}>
              <Text
                style={[styles.breakdownName, { color: theme.text }]}
                numberOfLines={2}
              >
                {row.name}
              </Text>
              <View style={styles.breakdownScoreWrap}>
                <Text style={[styles.breakdownScore, { color: theme.text }]}>
                  {row.score}
                </Text>
                <Text style={[styles.breakdownPercent, { color: theme.muted }]}>
                  {percent}%
                </Text>
              </View>
            </View>

            <View
              style={[styles.breakdownTrack, { backgroundColor: theme.soft }]}
            >
              <View
                style={[
                  styles.breakdownFill,
                  { width: `${percent}%`, backgroundColor: barColor },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ExamNavigator({
  open,
  setOpen,
  questions,
  answers,
  flagged,
  currentIndex,
  goToQuestion,
  theme,
  paper,
  accent,
}: any) {
  return (
    <Modal visible={open} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalCloseArea}
          onPress={() => setOpen(false)}
        />

        <View
          style={[
            styles.navigatorSheet,
            { backgroundColor: paper, borderColor: theme.border },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.navigatorHeader}>
            <Text style={[styles.navigatorTitle, { color: theme.text }]}>
              Question Palette
            </Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <MaterialCommunityIcons
                name="close"
                size={25}
                color={theme.text}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.paletteStats}>
            <PaletteStat
              label="Answered"
              value={questions.filter((q: Question) => !!answers[q.id]).length}
              color="#22C55E"
              theme={theme}
            />
            <PaletteStat
              label="Flagged"
              value={questions.filter((q: Question) => !!flagged[q.id]).length}
              color="#F97316"
              theme={theme}
            />
            <PaletteStat
              label="Blank"
              value={questions.filter((q: Question) => !answers[q.id]).length}
              color="#94A3B8"
              theme={theme}
            />
          </View>

          <ScrollView
            style={styles.paletteGridScroll}
            contentContainerStyle={styles.paletteGrid}
            showsVerticalScrollIndicator={false}
          >
            {questions.map((q: Question, index: number) => {
              const isCurrent = index === currentIndex;
              const isAnswered = !!answers[q.id];
              const isFlagged = !!flagged[q.id];
              const fill = isCurrent
                ? accent
                : isFlagged
                  ? "#F97316"
                  : isAnswered
                    ? "#22C55E"
                    : theme.soft;
              const color =
                isCurrent || isFlagged || isAnswered ? "#FFFFFF" : theme.text;

              return (
                <TouchableOpacity
                  key={q.id}
                  onPress={() => goToQuestion(index)}
                  style={[
                    styles.paletteItem,
                    { backgroundColor: fill, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.paletteItemText, { color }]}>
                    {index + 1}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PaletteStat({ label, value, color, theme }: any) {
  return (
    <View style={[styles.paletteStat, { backgroundColor: theme.soft }]}>
      <View style={[styles.paletteStatDot, { backgroundColor: color }]} />
      <Text style={[styles.paletteStatValue, { color: theme.text }]}>
        {value}
      </Text>
      <Text style={[styles.paletteStatLabel, { color: theme.muted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  examScreen: { flex: 1 },

  loadingBlock: {
    margin: 28,
    marginTop: 190,
    borderWidth: 1,
    borderRadius: 18,
    padding: 30,
    alignItems: "center",
  },

  loadingTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 18,
  },

  loadingSub: {
    fontSize: 13,
    marginTop: 6,
  },

  setupScroll: {
    paddingTop: 44,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },

  examSetupFixedTop: {
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 18,
    zIndex: 10,
  },

  setupScrollFixed: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },

  premiumBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 22,
    alignSelf: "flex-start",
  },

  backIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  backText: {
    fontSize: 14,
    fontWeight: "900",
  },

  brandMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  logoMini: {
    width: 32,
    height: 32,
    borderRadius: 9,
  },

  brandText: {
    fontSize: 13,
    fontWeight: "900",
  },

  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  flex1: { flex: 1 },
  resultCourse: { alignItems: "center", marginBottom: spacing.sm },
  resultCode: { ...typeScale.micro, letterSpacing: 0.8 },
  scoreHero: { alignItems: "center", paddingBottom: spacing.xxxl },
  headlineRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
    // ListSection supplies its own bottom margin but not a top one, so any
    // block sitting directly above a section has to space itself — this row
    // had none and collided with the Summary heading beneath it.
    marginBottom: spacing.xxxl,
    paddingHorizontal: spacing.xs,
  },
  headlineValue: { ...typeScale.title },
  headlineLabel: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backGlyph: {
    marginLeft: -spacing.sm,
  },

  title: {
    ...typeScale.display,
  },

  subtitle: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },

  selectBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  selectedCourseCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },

  selectedCourseIcon: {
    width: 56,
    height: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },

  courseMiniIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  selectCode: {
    fontSize: 17,
    fontWeight: "900",
  },

  selectTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  courseList: {
    marginTop: spacing.xs,
    // The rows used to be separated by a bottom border; as cards they need
    // real space or they read as one block.
    gap: spacing.md,
  },

  courseFlatRow: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  courseCode: {
    ...typeScale.micro,
    letterSpacing: 0.6,
  },

  courseName: {
    ...typeScale.bodyLg,
    fontWeight: weight.semi,
    marginTop: spacing.xxs,
  },

  courseMeta: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },

  // Parked offscreen purely so ViewShot has something laid out to capture.
  hiddenShareWrap: { position: "absolute", left: -9999, top: 0 },

  emptyCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 190,
    marginTop: 8,
  },

  emptyTitle: {
    marginTop: 13,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },

  divider: {
    height: 1,
    marginVertical: 16,
  },

  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },

  caption: {
    fontSize: 12,
    fontWeight: "700",
  },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  timeStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  stepBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  stepInput: {
    width: 64,
    height: 42,
    borderWidth: 1,
    borderRadius: 14,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 16,
  },

  timeValueBox: {
    minWidth: 74,
    alignItems: "center",
  },

  timeValue: {
    fontSize: 24,
    fontWeight: "900",
  },

  timeUnit: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: -2,
  },

  examInfo: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    marginBottom: 18,
  },

  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },

  infoTitle: {
    fontSize: 15,
    fontWeight: "900",
  },

  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },

  infoGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },

  infoMini: {
    flex: 1,
  },

  infoMiniLabel: {
    fontSize: 11,
    fontWeight: "800",
  },

  infoMiniValue: {
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3,
  },

  startButton: {
    minHeight: 54,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  startButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  preparingTop: {
    paddingTop: 48,
    paddingHorizontal: 22,
  },

  preparingCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingBottom: 80,
  },

  preparingTitle: {
    fontSize: 25,
    fontWeight: "900",
    marginBottom: 32,
  },

  progressRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 26,
  },

  progressPercent: {
    fontSize: 32,
    fontWeight: "900",
  },

  prepareBar: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 18,
  },

  prepareFill: {
    height: "100%",
    borderRadius: 999,
  },

  prepareNote: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },

  examHeader: {
    paddingTop: 42,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  examCourse: {
    fontSize: 18,
    fontWeight: "900",
  },

  examCount: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },

  timerPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  timerText: {
    fontSize: 12,
    fontWeight: "900",
  },

  paletteStrip: {
    borderBottomWidth: 1,
  },

  paletteInline: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
  },

  paletteSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  paletteSmallText: {
    fontSize: 12,
    fontWeight: "900",
  },

  questionPaper: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 230,
  },

  paperNo: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 14,
  },

  paperQuestion: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 33,
    marginBottom: 28,
  },

  optionsList: {
    gap: 14,
  },

  optionLine: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },

  optionLetter: {
    fontSize: 15,
    fontWeight: "900",
  },

  optionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },

  examFooter: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 92,
    borderTopWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  footerText: {
    fontWeight: "900",
    fontSize: 13,
  },

  nextButton: {
    marginLeft: "auto",
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },

  nextText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  resultScroll: {
    paddingTop: 50,
    paddingHorizontal: 22,
    paddingBottom: 150,
  },

  resultHeader: {
    marginBottom: 24,
  },

  resultKicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  resultTitle: {
    fontSize: 36,
    fontWeight: "900",
    marginTop: 6,
  },

  resultSub: {
    ...typeScale.body,
    fontWeight: weight.regular,
    marginTop: spacing.xxs,
    textAlign: "center",
  },

  scoreSection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 26,
    alignItems: "center",
    marginBottom: 22,
  },

  scorePercent: {
    ...typeScale.mega,
  },

  gradePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },

  gradeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  resultMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    marginBottom: 28,
  },

  resultHeroCard: {
    borderWidth: 1,
    borderRadius: 34,
    padding: 22,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },

  resultTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginBottom: 20,
  },

  resultCourseIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  shareCircle: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  scoreHeroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 16,
  },

  scoreLabel: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },

  gradePillBig: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },

  resultTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    alignSelf: "stretch",
    marginTop: spacing.xl,
  },

  resultFill: {
    height: "100%",
    borderRadius: 999,
  },

  resultMetricGridPremium: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  resultActionsGrid: {
    gap: 12,
    marginBottom: 18,
  },

  resultActionCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  resultActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  resultActionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },

  resultActionSub: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },

  resultMetric: {
    width: "30%",
    minWidth: 88,
    borderRadius: 20,
    padding: 12,
  },

  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },

  metricValue: {
    fontSize: 25,
    fontWeight: "900",
  },

  metricLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  breakdownBlock: {
    marginTop: 24,
    marginBottom: 8,
  },

  breakdownTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
  },

  breakdownRow: {
    borderBottomWidth: 1,
    paddingVertical: 13,
  },

  breakdownTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 9,
  },

  breakdownName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },

  breakdownScoreWrap: {
    alignItems: "flex-end",
  },

  breakdownScore: {
    fontSize: 13,
    fontWeight: "900",
  },

  breakdownPercent: {
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  breakdownTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
  },

  breakdownFill: {
    height: "100%",
    borderRadius: 999,
  },

  tableBlock: {
    marginTop: 12,
    marginBottom: 22,
  },

  tableTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },

  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },

  tableHeadText: {
    fontSize: 11,
    fontWeight: "900",
  },

  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },

  tableText: {
    fontSize: 12,
    fontWeight: "800",
  },

  outlineAction: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },

  outlineActionText: {
    fontWeight: "900",
  },

  secondaryAction: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
  },

  secondaryActionText: {
    fontWeight: "900",
  },










  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000099",
    justifyContent: "flex-end",
  },

  modalCloseArea: {
    flex: 1,
  },

  navigatorSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },

  sheetHandle: {
    width: 50,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#94A3B8",
    alignSelf: "center",
    marginBottom: 18,
  },

  navigatorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  navigatorTitle: {
    fontSize: 21,
    fontWeight: "900",
  },

  paletteStats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },

  paletteStat: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
  },

  paletteStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },

  paletteStatValue: {
    fontSize: 20,
    fontWeight: "900",
  },

  paletteStatLabel: {
    fontSize: 11,
    fontWeight: "800",
  },

  paletteGridScroll: {
    maxHeight: 330,
  },

  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 8,
  },

  paletteItem: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  paletteItemText: {
    fontWeight: "900",
  },
});