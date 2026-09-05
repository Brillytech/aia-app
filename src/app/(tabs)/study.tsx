import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
// TODO: Enable when app is ready for production.
// import * as ScreenCapture from "expo-screen-capture";
import { Asset } from "expo-asset";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { courseCode, sortCoursesAlphabetically } from "../../courses";
import { useScreenTime } from "../../screen-time";
import { category, useThemeMode } from "../../theme";
import { useBreakpoint, useContentInset } from "../../ui/layout/breakpoints";
import { SplitPane } from "../../ui/layout/SplitPane";
import { AlertModal } from "../../ui/AlertModal";
import type { IconName } from "../../ui/alerts";
import { Card } from "../../ui/Card";
import { haptics } from "../../ui/haptics";
import { IconPlate } from "../../ui/IconPlate";
import { MaterialFrame } from "../../ui/MaterialFrame";
import { openPrintWindow, printHtmlDocument, summaryPrintTitle } from "../../ui/print-html";
import { subjectColor, subjectIcon } from "../../ui/subject";
import { elevation, layout, motion as motionTokens, noFocusRing, radius, spacing, type as typeScale, weight, withAlpha } from "../../ui/tokens";
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
type Topic = {
  id: string;
  title: string;
  description?: string | null;
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
};
type Material = {
  id: string;
  title: string;
  type: string;
  file_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  content?: string | null;
  summary_1?: string | null;
};
type AlertType = "success" | "error" | "warning" | "info";
type FlashRating = "Again" | "Hard" | "Good" | "Save";
const fallbackCourses: Course[] = [
  {
    id: "demo-cvs",
    code: "CVS",
    title: "Cardiovascular System",
    department: "Medicine",
    level: "200 Level",
  },
  {
    id: "demo-renal",
    code: "RENAL",
    title: "Renal Physiology",
    department: "Medicine",
    level: "200 Level",
  },
];
const fallbackTopics: Topic[] = [
  {
    id: "topic-1",
    title: "Heart Anatomy",
    description: "Chambers, valves, vessels and cardiac cycle basics.",
  },
  {
    id: "topic-2",
    title: "Blood Pressure",
    description: "Cardiac output, vascular resistance and control of blood pressure.",
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
  },
];
const fallbackMaterials: Material[] = [
  {
    id: "m1",
    title: "Heart Anatomy Summary Note",
    type: "note",
    content: "A short uploaded note on chambers, valves and major vessels.",
    summary_1:
      "The heart has four chambers: two atria and two ventricles. The left ventricle pumps blood to the body.",
  },
];
// "Summary" is no longer a tab — a summary belongs to the material it
// summarises, so it now expands inline inside each material row instead of
// living in a separate list that repeated every title.
// Materials before Questions: reading the material is the step that comes
// first in the actual study flow, so the tab order now matches it.
/**
 * Width at which the library becomes a grid and a picked course splits into
 * two panes.
 *
 * The highest breakpoint in the app, because this screen pays twice: it sits
 * behind the 240px sidebar AND wants a 320px course rail beside real content.
 * Below this a two-pane study view would leave the reading column narrower
 * than the list next to it, which is the wrong way round.
 */
const STUDY_SPLIT = 1200;

/** Course rail width once a course is open. */
const COURSE_RAIL = 320;

const tabs = ["Topics", "Materials", "Questions", "Cards"];

/** Opacity ramp for the header's soft bottom edge, densest at the top. */
const FADE_STEPS = [0.92, 0.72, 0.48, 0.26, 0.1, 0];
const FADE_HEIGHT = 24;
function isUuid(value?: string | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
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
const MATERIALS_SEEN_KEY = "lasu_scholar_materials_seen";

function getTodayDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * True the first time a material is opened today, false on every reopen.
 *
 * The daily goal counts `user_progress.materials_opened`, which was
 * incremented on every open — so reading the same PDF three times logged
 * three materials. This gates the increment on a day-scoped set of ids.
 *
 * The stored date IS the reset: when the key's date no longer matches today,
 * the whole record is replaced rather than appended to, so it self-prunes and
 * never grows beyond one day's ids.
 *
 * Device-local by design — it needs no schema change. A reinstall or a second
 * device starts a fresh day, which can only ever under-count, never inflate.
 */
async function shouldCountMaterialToday(materialId: string) {
  const today = getTodayDateKey();

  try {
    const raw = await AsyncStorage.getItem(MATERIALS_SEEN_KEY);
    const saved = raw ? JSON.parse(raw) : null;

    const ids: string[] =
      saved && saved.date === today && Array.isArray(saved.ids) ? saved.ids : [];

    if (ids.includes(materialId)) return false;

    await AsyncStorage.setItem(
      MATERIALS_SEEN_KEY,
      JSON.stringify({ date: today, ids: [...ids, materialId] }),
    );

    return true;
  } catch {
    // Storage failure shouldn't block opening the material; counting it is
    // the lesser problem.
    return true;
  }
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
/** Shim over the shared resolver so the ~200 existing call sites keep their
 *  shape. The local 100-line colour map and keyword chain it replaced was one
 *  of four in the app that disagreed with each other. */
function getCourseTheme(courseOrCode: Course | string, title = "") {
  const course = typeof courseOrCode === "string" ? null : courseOrCode;
  const probe = course ?? { code: typeof courseOrCode === "string" ? courseOrCode : "", title };

  return { icon: subjectIcon(probe), color: subjectColor(probe) };
}

function getMaterialTheme(type: string): { icon: IconName; color: string } {
  const lower = String(type || "").toLowerCase();
  if (lower.includes("video")) return { icon: "play-circle", color: category.red };
  if (lower.includes("pdf")) return { icon: "file-pdf-box", color: category.purple };
  if (lower.includes("note")) return { icon: "note-text", color: category.green };
  if (lower.includes("image")) return { icon: "image", color: category.blue };
  if (lower.includes("link")) return { icon: "link-variant", color: category.teal };
  return { icon: "file-document", color: category.blue };
}
function getMaterialKind(type?: string | null) {
  const lower = String(type || "").toLowerCase();
  if (lower.includes("video")) return "video";
  if (lower.includes("pdf")) return "pdf";
  if (lower.includes("note")) return "note";
  if (lower.includes("image")) return "image";
  if (lower.includes("link")) return "link";
  return "file";
}
function getGoogleFileIdFromUrl(url: string) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";
  const pathMatch = cleanUrl.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([^/]+)/);
  if (pathMatch?.[1]) return pathMatch[1];
  const idMatch = cleanUrl.match(/[?&]id=([^&]+)/);
  if (idMatch?.[1]) return idMatch[1];
  return "";
}
function getGoogleDrivePreviewUrl(url: string) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";
  if (cleanUrl.includes("docs.google.com/document/d/")) {
    const id = getGoogleFileIdFromUrl(cleanUrl);
    return id ? `https://docs.google.com/document/d/${id}/preview` : "";
  }
  if (cleanUrl.includes("docs.google.com/spreadsheets/d/")) {
    const id = getGoogleFileIdFromUrl(cleanUrl);
    return id ? `https://docs.google.com/spreadsheets/d/${id}/preview` : "";
  }
  if (cleanUrl.includes("docs.google.com/presentation/d/")) {
    const id = getGoogleFileIdFromUrl(cleanUrl);
    return id ? `https://docs.google.com/presentation/d/${id}/preview` : "";
  }
  if (cleanUrl.includes("drive.google.com")) {
    const id = getGoogleFileIdFromUrl(cleanUrl);
    return id ? `https://drive.google.com/file/d/${id}/preview` : "";
  }
  return "";
}
function getPdfViewerUrl(url: string) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";
  const drivePreviewUrl = getGoogleDrivePreviewUrl(rawUrl);
  if (drivePreviewUrl) return drivePreviewUrl;
  return `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(rawUrl)}`;
}
function getInAppUrl(material: Material) {
  const rawUrl = material.file_url || material.video_url || "";
  if (!rawUrl) return "";
  const kind = getMaterialKind(material.type);
  const drivePreviewUrl = getGoogleDrivePreviewUrl(rawUrl);
  // Google Drive / Google Docs links should always use Google's own preview,
  // because PDF.js cannot reliably fetch Drive files due to access/CORS rules.
  if (drivePreviewUrl) return drivePreviewUrl;
  if (kind === "pdf") {
    return getPdfViewerUrl(rawUrl);
  }
  return rawUrl;
}
function hasText(value?: string | null) {
  return Boolean(String(value || "").trim());
}
function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
/**
 * The bundled logo as a data URI, so the print template can embed it — an
 * HTML string has no access to the bundler's asset paths.
 *
 * Resolved once and cached. Returns null rather than throwing if the asset
 * can't be read, and the template falls back to a drawn monogram, so a PDF
 * never fails to generate over a missing logo.
 */
let logoDataUriCache: string | null | undefined;

async function getLogoDataUri(): Promise<string | null> {
  if (logoDataUriCache !== undefined) return logoDataUriCache;

  try {
    const asset = Asset.fromModule(require("../../../assets/ls-logo.png"));
    await asset.downloadAsync();

    const localUri = asset.localUri || asset.uri;
    if (!localUri) {
      logoDataUriCache = null;
      return null;
    }

    // fetch + FileReader rather than FileSystem.readAsStringAsync. The
    // file-system module is a method-less shim on web, so the old call threw
    // there and the summary silently lost its logo. This path reads the
    // bundled asset over `file://` on native and over http on web.
    const blob = await (await fetch(localUri)).blob();

    logoDataUriCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.log("LOGO EMBED SKIPPED:", error);
    logoDataUriCache = null;
  }

  return logoDataUriCache;
}

function buildSummaryHtml(params: {
  materialTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  topicTitle?: string | null;
  department?: string | null;
  level?: string | null;
  preparedFor?: string | null;
  summary: string;
  logoDataUri?: string | null;
}) {
  const {
    materialTitle,
    courseCode,
    courseTitle,
    topicTitle,
    department,
    level,
    preparedFor,
    summary,
    logoDataUri,
  } = params;

  const generatedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const courseLine = [courseCode, courseTitle].filter(Boolean).join(" — ") || "—";
  const contextLine = [department, level].filter(Boolean).join(" • ") || "—";

  // Split on blank lines so long summaries breathe instead of arriving as one
  // dense block.
  const paragraphs = summary
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const summaryHtml = (paragraphs.length ? paragraphs : [summary])
    .map((part) => '<p class="para">' + escapeHtml(part) + "</p>")
    .join("");

  // The logo is ~70KB as base64. Declaring it ONCE as a custom property and
  // referencing it from both the masthead and the watermark keeps a single
  // copy in the document — embedding it twice doubled the file and was what
  // made the PDF slow to open.
  const logoVar = logoDataUri
    ? ":root{--logo:url('" + logoDataUri + "')}"
    : "";

  // Falls back to a drawn monogram if the asset could not be read, so a
  // missing file never blocks the export.
  const mark = logoDataUri
    ? '<div class="mark-img"></div>'
    : '<div class="mark-fallback">LS</div>';

  // Always the wordmark, never the logo. A rotated logo at 5% reads as a
  // smudge; set as type it stays legible as a mark of origin. Also halves
  // the document, since the base64 image is now referenced once, not twice.
  const watermark = '<div class="wm-text">AIA&bull;ACADEMY</div>';

  const meta = [
    ["Course", courseLine],
    ["Topic", topicTitle || "—"],
    ["Department &amp; level", contextLine],
    ["Prepared for", preparedFor || "LASU Scholar student"],
  ]
    .map(
      (entry) =>
        '<div class="meta-item"><div class="meta-label">' +
        entry[0] +
        '</div><div class="meta-value">' +
        escapeHtml(String(entry[1])) +
        "</div></div>",
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      /* Geometry in mm so the sheet is identical on A4 and Letter. */
      @page { size: A4; margin: 0; }

      ${logoVar}

      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      html, body {
        margin: 0;
        padding: 0;
        background: #FFFFFF;
        color: #101828;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      .sheet {
        position: relative;
        min-height: 297mm;
        /* Wider margins so the text column lands near 65 characters, which is
           where long-form reading is comfortable. */
        padding: 22mm 20mm 26mm;
        overflow: hidden;
      }

      /* Fixed rather than absolute: in paged media a fixed element is laid
         out against the page box, so it repeats on every printed page. An
         absolute one only ever painted on page 1. Sits as a direct child of
         body so no ancestor overflow can clip it, and stays light enough not
         to fight the text on a mono laser printer. */
      .wm-text {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-24deg);
        opacity: 0.085;
        z-index: 0;
        pointer-events: none;
        font-size: 19mm;
        line-height: 1;
        font-weight: 800;
        letter-spacing: 0.08em;
        white-space: nowrap;
        text-align: center;
        color: #F97316;
      }

      .content { position: relative; z-index: 1; }

      .masthead {
        display: flex;
        align-items: center;
        gap: 4mm;
        padding-bottom: 5mm;
        border-bottom: 0.6mm solid #F97316;
      }
      .mark-img {
        width: 13mm; height: 13mm;
        border-radius: 3mm;
        background-image: var(--logo);
        background-size: cover;
        background-position: center;
        display: block;
        flex: none;
      }
      .mark-fallback {
        width: 13mm; height: 13mm;
        border-radius: 3mm;
        background: #F97316;
        color: #FFFFFF;
        font-weight: 800;
        font-size: 5.4mm;
        letter-spacing: 0.04em;
        display: flex; align-items: center; justify-content: center;
      }
      .brand { flex: 1; }
      .brand-name { font-size: 4.6mm; font-weight: 700; letter-spacing: -0.01em; }
      .brand-sub { margin-top: 0.8mm; font-size: 3mm; color: #667085; }
      .brand-tag {
        font-size: 2.7mm;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #F97316;
        font-weight: 700;
        white-space: nowrap;
      }

      h1 {
        margin: 9mm 0 0;
        font-size: 8.4mm;
        line-height: 1.18;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      /* auto-fit rather than a fixed 2-up grid, so it collapses instead of
         overflowing on a narrow preview. */
      .meta {
        margin-top: 7mm;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(58mm, 1fr));
        gap: 4mm;
        padding: 5mm;
        background: #FFF7ED;
        border-radius: 3mm;
      }
      .meta-label {
        font-size: 2.7mm;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #B54708;
        font-weight: 700;
      }
      .meta-value { margin-top: 1.2mm; font-size: 3.6mm; font-weight: 600; word-break: break-word; }

      .section {
        margin: 9mm 0 4mm;
        display: flex;
        align-items: center;
        gap: 3mm;
      }
      .section-label {
        font-size: 3mm;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-weight: 700;
        color: #667085;
      }
      .section-rule { flex: 1; height: 0.3mm; background: #EAECF0; }

      .para {
        margin: 0 0 4mm;
        font-size: 3.9mm;
        line-height: 1.72;
        color: #344054;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .para:last-child { margin-bottom: 0; }

      .footer {
        position: absolute;
        left: 16mm; right: 16mm; bottom: 10mm;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 4mm;
        padding-top: 4mm;
        border-top: 0.3mm solid #EAECF0;
        font-size: 2.9mm;
        color: #98A2B3;
      }
      .footer strong { color: #F97316; font-weight: 700; }

      /* Phone preview: drop the fixed page height and unpin the footer so
         nothing is clipped or overlapped on a small screen. */
      @media screen and (max-width: 520px) {
        .sheet { min-height: auto; padding: 20px 18px 28px; }
        h1 { font-size: 26px; margin-top: 24px; }
        .meta { grid-template-columns: 1fr; gap: 14px; padding: 16px; border-radius: 12px; margin-top: 20px; }
        .meta-label { font-size: 10px; }
        .meta-value { font-size: 14px; }
        .brand-name { font-size: 17px; }
        .brand-sub, .brand-tag { font-size: 11px; }
        .mark-img, .mark-fallback { width: 44px; height: 44px; border-radius: 12px; font-size: 18px; }
        .section { margin: 26px 0 12px; }
        .section-label { font-size: 11px; }
        .para { font-size: 15px; line-height: 1.7; margin-bottom: 14px; }
        .wm-text { font-size: 42px; letter-spacing: 0.04em; }
        .footer {
          position: static;
          margin-top: 28px;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          font-size: 11px;
        }
      }
    </style>
  </head>
  <body>
    ${watermark}

    <div class="sheet">
      <div class="content">
        <div class="masthead">
          ${mark}
          <div class="brand">
            <div class="brand-name">LASU Scholar</div>
            <div class="brand-sub">Powered by AIA&bull;ACADEMY</div>
          </div>
          <div class="brand-tag">Study summary</div>
        </div>

        <h1>${escapeHtml(materialTitle)}</h1>

        <div class="meta">${meta}</div>

        <div class="section">
          <span class="section-label">Summary</span>
          <span class="section-rule"></span>
        </div>

        ${summaryHtml}

        <div class="footer">
          <span>Generated ${generatedDate}</span>
          <span><strong>Learn smarter. Score higher.</strong></span>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function answerText(q: Question) {
  const answer = q.correct_answer.toUpperCase();
  if (answer === "A") return q.option_a;
  if (answer === "B") return q.option_b;
  if (answer === "C") return q.option_c || "";
  if (answer === "D") return q.option_d || "";
  if (answer === "E") return q.option_e || "";
  return q.correct_answer;
}
function getQuestionOptions(q: Question) {
  return [
    ["A", q.option_a],
    ["B", q.option_b],
    ["C", q.option_c],
    ["D", q.option_d],
    ["E", q.option_e],
  ].filter(([, value]) => Boolean(value));
}
export default function Study() {
  const wide = useBreakpoint(STUDY_SPLIT);
  const contentInset = useContentInset();
  const { theme, isDark } = useThemeMode();
  const params = useLocalSearchParams<{
    courseId?: string;
    topicId?: string;
    /** Per-tap nonce from the dashboard; see `openInStudy` there. */
    t?: string;
  }>();
  /** The link this screen has already acted on. */
  const handledLinkRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [activeTab, setActiveTab] = useState("Topics");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [quickCardIndex, setQuickCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [quickCardRatings, setQuickCardRatings] = useState<Record<string, FlashRating>>({});
  const [savedCardIds, setSavedCardIds] = useState<string[]>([]);
  const [hardCardIds, setHardCardIds] = useState<string[]>([]);
  const [reviewMode, setReviewMode] = useState(false);
  const [hardReviewMode, setHardReviewMode] = useState(false);
  const [materialViewer, setMaterialViewer] = useState<{
    visible: boolean;
    material: Material | null;
  }>({
    visible: false,
    material: null,
  });

  const [completedTopicIds, setCompletedTopicIds] = useState<Set<string>>(new Set());
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);
  const [downloadingSummaryId, setDownloadingSummaryId] = useState<string | null>(null);
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);
  // Drives the header collapse. A boolean rather than a raw offset so the
  // header animates once at a threshold instead of re-rendering every frame.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const pulse = useRef(new Animated.Value(1)).current;

  // Every second on this screen counts, whether you are reading a PDF, sitting
  // on the course list, or halfway through a flashcard deck. The tracker banks
  // time against whichever course/topic is open when each slice is written.
  useScreenTime("study", selectedCourse?.id, selectedTopic?.id);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });
  const surface = theme.card;
  const selectedCourseTheme = selectedCourse
    ? getCourseTheme(selectedCourse)
    : getCourseTheme("", "");
  const filteredCourses = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return courses;
    return courses.filter((course) => {
      const value = `${course.code} ${course.title} ${course.department} ${course.level}`.toLowerCase();
      return value.includes(query);
    });
  }, [courses, search]);
  const currentQuestion = questions[questionIndex];
  const quickDeck = hardReviewMode
    ? questions.filter((question) => hardCardIds.includes(question.id))
    : reviewMode
      ? questions.filter((question) => savedCardIds.includes(question.id))
      : questions;
  const currentQuickCard = quickDeck[quickCardIndex];
  useEffect(() => {
    loadCourses();
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.018,
          duration: 1900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  // Deep links from the dashboard — course rows, "Continue learning" and the
  // Recommended list all push `/study` with a courseId (and sometimes a
  // topicId). They were being pushed all along; nothing on this screen read
  // them, which is why every one of them landed on the bare course list.
  //
  // Keyed on the ids plus the dashboard's per-tap nonce, so re-tapping the
  // same course after backing out re-opens it, while a plain re-render with
  // unchanged params does not fight the user by yanking them back.
  const openDeepLink = useCallback(
    async (courseId: string, topicId: string) => {
      const course = courses.find((item) => String(item.id) === courseId);
      if (!course) return;

      const loadedTopics = await openCourse(course);
      if (!topicId) return;

      const topic = loadedTopics.find((item) => String(item.id) === topicId);
      if (topic) await openTopic(topic, course);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courses],
  );

  useEffect(() => {
    const courseId = String(params.courseId || "");
    const topicId = String(params.topicId || "");

    if (!courseId || courses.length === 0) return;

    const signature = `${courseId}:${topicId}:${params.t || ""}`;
    if (handledLinkRef.current === signature) return;

    handledLinkRef.current = signature;
    openDeepLink(courseId, topicId);
  }, [params.courseId, params.topicId, params.t, courses, openDeepLink]);

  // TODO: Enable this back when the app is ready for production.
  // This blocks screenshots/screen recording on Study Mode.
  //
  // useEffect(() => {
  //   ScreenCapture.preventScreenCaptureAsync("study-screen");
  //
  //   return () => {
  //     ScreenCapture.allowScreenCaptureAsync("study-screen");
  //   };
  // }, []);
  function showAlert(type: AlertType, title: string, message: string) {
    setAlert({ visible: true, type, title, message });
  }
  function closeAlert() {
    setAlert((prev) => ({ ...prev, visible: false }));
  }
  async function loadCourses() {
    setLoadingCourses(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setCourses([]);
      setLoadingCourses(false);
      return;
    }

    await ensureDefaultGoals(user.id);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("school, faculty, department, level")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.log("PROFILE FOR STUDY ERROR:", profileError.message);
      setCourses([]);
      setLoadingCourses(false);
      return;
    }

    if (!profile?.school || !profile?.department || !profile?.level) {
      setCourses([]);
      setLoadingCourses(false);
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
      console.log("LIVE PERIOD CONTROL ERROR:", controlError.message);
      setCourses([]);
      setLoadingCourses(false);
      return;
    }

    const livePeriodId = control?.live_period_id;

    if (!livePeriodId) {
      setCourses([]);
      setLoadingCourses(false);
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
      console.log("OWNED COURSES ERROR:", ownedError.message);
    }

    if (sharedError) {
      console.log("SHARED COURSES ERROR:", sharedError.message);
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

    const uniqueCourses = sortCoursesAlphabetically(
      Array.from(
        new Map([...directCourses, ...sharedCourses].map((course) => [course.id, course])).values()
      ).filter((course) => (course.status || "active") === "active")
    );

    setCourses(uniqueCourses);
    setLoadingCourses(false);
  }
  // Returns the topics it loaded so a deep link can chain straight into one
  // without waiting for the `topics` state to land on the next render.
  async function openCourse(course: Course): Promise<Topic[]> {
    setLoadingTopics(true);
    setSelectedCourse(course);
    setSelectedTopic(null);
    setActiveTab("Topics");
    setTopics([]);
    setQuestions([]);
    setMaterials([]);
    setSelectedAnswers({});
    setQuestionIndex(0);
    setCompletedTopicIds(new Set());
    resetQuickCards();
    if (!isUuid(course.id)) {
      setTopics(fallbackTopics);
      setCompletedTopicIds(new Set());
      setLoadingTopics(false);
      return fallbackTopics;
    }
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .eq("course_id", course.id)
      .order("created_at", { ascending: true });
    if (error) {
      showAlert("error", "Topics Error", error.message || "Could not load topics.");
      setLoadingTopics(false);
      return [];
    }
    if (!data || data.length === 0) {
      setTopics([]);
      setLoadingTopics(false);
      showAlert(
        "warning",
        "No Topics Yet",
        "No topics have been added for this course yet."
      );
      return [];
    }
    setTopics(data);
    await loadCompletedTopics(course.id, data);
    setLoadingTopics(false);
    return data;
  }
  // `courseOverride` lets a deep link open a topic in the same tick it opened
  // the course, before `selectedCourse` has been committed by React.
  async function openTopic(topic: Topic, courseOverride?: Course) {
    const course = courseOverride ?? selectedCourse;
    if (!course) return;
    setLoadingContent(true);
    setSelectedTopic(topic);
    setActiveTab("Questions");
    setSelectedAnswers({});
    setQuestionIndex(0);
    resetQuickCards();
    if (!isUuid(course.id) || !isUuid(topic.id)) {
      setQuestions(fallbackQuestions);
      setMaterials(fallbackMaterials);
      setLoadingContent(false);
      return;
    }
    const [{ data: qs, error: qsError }, { data: mats, error: matsError }] =
      await Promise.all([
        supabase
          .from("questions")
          .select("*")
          .eq("course_id", course.id)
          .eq("topic_id", topic.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("materials")
          .select("*")
          .eq("course_id", course.id)
          .eq("topic_id", topic.id)
          .order("created_at", { ascending: false }),
      ]);
    if (qsError) console.log("QUESTIONS LOAD ERROR:", qsError.message);
    if (matsError) console.log("MATERIALS LOAD ERROR:", matsError.message);
    setQuestions(qs && qs.length > 0 ? qs : []);
    setMaterials(mats && mats.length > 0 ? mats : []);
    setLoadingContent(false);
  }
  function resetQuickCards() {
    setQuickCardIndex(0);
    setShowBack(false);
    setQuickCardRatings({});
    setSavedCardIds([]);
    setHardCardIds([]);
    setReviewMode(false);
    setHardReviewMode(false);
  }
  async function loadCompletedTopics(courseId: string, topicList: Topic[]) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user || !isUuid(courseId) || topicList.length === 0) {
      setCompletedTopicIds(new Set());
      return;
    }

    const topicIds = topicList.filter((topic) => isUuid(topic.id)).map((topic) => topic.id);

    if (topicIds.length === 0) {
      setCompletedTopicIds(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("user_topic_progress")
      .select("topic_id")
      .eq("user_id", user.id)
      .eq("completed", true)
      .in("topic_id", topicIds);

    if (!error && data) {
      setCompletedTopicIds(new Set(data.map((row: any) => String(row.topic_id))));
      return;
    }

    const fallback = await supabase
      .from("user_progress")
      .select("topic_id, progress_percent, progress, percent")
      .eq("user_id", user.id)
      .in("topic_id", topicIds);

    if (!fallback.error && fallback.data) {
      const completed = fallback.data
        .filter((row: any) => Number(row.progress_percent || row.progress || row.percent || 0) >= 100)
        .map((row: any) => String(row.topic_id));

      setCompletedTopicIds(new Set(completed));
      return;
    }

    setCompletedTopicIds(new Set());
  }

  async function toggleTopicCompletion(topic: Topic) {
    try {
      if (!selectedCourse) return;

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user || !isUuid(selectedCourse.id) || !isUuid(topic.id)) {
        showAlert("warning", "Not Available", "This topic cannot be updated yet.");
        return;
      }

      const currentlyCompleted = completedTopicIds.has(String(topic.id));
      const nextCompleted = !currentlyCompleted;
      const now = new Date().toISOString();

      setSavingTopicId(topic.id);

      const { error } = await supabase.from("user_topic_progress").upsert(
        {
          user_id: user.id,
          course_id: selectedCourse.id,
          topic_id: topic.id,
          completed: nextCompleted,
          completed_at: nextCompleted ? now : null,
          updated_at: now,
        },
        { onConflict: "user_id,topic_id" }
      );

      if (error) {
        showAlert("error", "Progress Error", error.message);
        return;
      }

      await supabase.from("user_progress").upsert(
        {
          user_id: user.id,
          course_id: selectedCourse.id,
          topic_id: topic.id,
          progress_percent: nextCompleted ? 100 : 0,
          updated_at: now,
        },
        { onConflict: "user_id,course_id,topic_id" }
      );

      setCompletedTopicIds((prev) => {
        const next = new Set(prev);

        if (nextCompleted) {
          next.add(String(topic.id));
        } else {
          next.delete(String(topic.id));
        }

        return next;
      });

      // No alert on success. The checkbox flipping *is* the confirmation, and
      // a sheet you have to dismiss after every topic turns marking progress
      // into a chore.
      haptics.success();
    } catch (error) {
      console.log("TOPIC COMPLETION TOGGLE ERROR:", error);
      showAlert("error", "Progress Error", "Could not update this topic.");
    } finally {
      setSavingTopicId(null);
    }
  }

  async function ensureDefaultGoals(userId: string) {
    const { data: existingGoals } = await supabase
      .from("user_goals")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (existingGoals && existingGoals.length > 0) return;
    await supabase.from("user_goals").upsert(
      {
        user_id: userId,
        daily_questions_goal: 20,
        daily_topics_goal: 3,
        daily_materials_goal: 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }
  async function updateStudyProgress(payload?: {
    questionId?: string;
    answeredCorrect?: boolean;
    materialOpened?: boolean;
    progressPercent?: number;
    quickCardRating?: FlashRating;
  }) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || !selectedCourse || !selectedTopic) return;
      if (!isUuid(selectedCourse.id) || !isUuid(selectedTopic.id)) return;
      await ensureDefaultGoals(user.id);
      const safeQuestionId = isUuid(payload?.questionId)
        ? payload?.questionId
        : undefined;
      const { data: existingRows, error: existingError } = await supabase
        .from("user_progress")
        .select("*")
        .eq("user_id", user.id)
        .eq("course_id", selectedCourse.id)
        .eq("topic_id", selectedTopic.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (existingError) return;
      const existing = existingRows?.[0];
      const shouldCountQuestion = Boolean(payload?.questionId);
      const shouldCountCorrect = Boolean(payload?.questionId && payload?.answeredCorrect);
      const shouldCountMaterial = Boolean(payload?.materialOpened);
      const nextQuestionsStudied =
        (existing?.questions_studied || 0) + (shouldCountQuestion ? 1 : 0);
      const nextQuestionsCorrect =
        (existing?.questions_correct || 0) + (shouldCountCorrect ? 1 : 0);
      const nextMaterialsOpened =
        (existing?.materials_opened || 0) + (shouldCountMaterial ? 1 : 0);
      const derivedQuestionProgress =
        questions.length > 0
          ? Math.round((nextQuestionsStudied / questions.length) * 100)
          : 0;
      const nextProgressPercent = Math.max(
        existing?.progress_percent || 0,
        payload?.progressPercent || 0,
        derivedQuestionProgress
      );
      const nextProgress = {
        id: existing?.id,
        user_id: user.id,
        course_id: selectedCourse.id,
        topic_id: selectedTopic.id,
        last_question_id: safeQuestionId || existing?.last_question_id || null,
        questions_studied: nextQuestionsStudied,
        questions_correct: nextQuestionsCorrect,
        materials_opened: nextMaterialsOpened,
        last_quick_card_rating:
          payload?.quickCardRating || existing?.last_quick_card_rating || null,
        progress_percent: Math.min(100, nextProgressPercent),
        updated_at: new Date().toISOString(),
      };
      await supabase
        .from("user_progress")
        .upsert(nextProgress, { onConflict: "user_id,course_id,topic_id" });
    } catch (error) {
      console.log("Progress update failed:", error);
    }
  }
  function chooseAnswer(question: Question, answer: string) {
    const questionId = question.id;
    const isCorrect = question.correct_answer.toUpperCase() === answer.toUpperCase();
    const alreadyAnswered = Boolean(selectedAnswers[questionId]);
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
    if (!alreadyAnswered) {
      requestAnimationFrame(() => {
        updateStudyProgress({
          questionId,
          answeredCorrect: isCorrect,
          progressPercent: 25,
        });
      });
    }
  }
  function nextQuestion() {
    if (questions.length === 0) return;
    setQuestionIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }
  function previousQuestion() {
    if (questions.length === 0) return;
    setQuestionIndex((prev) => Math.max(prev - 1, 0));
  }
  function getSummary(material: Material) {
    if (hasText(material.summary_1)) {
      return material.summary_1 as string;
    }
    return "No summary has been added for this material yet.";
  }
  function getSummaryPoints(material: Material) {
    return hasText(material.summary_1) ? [material.summary_1 as string] : [];
  }
  async function downloadMaterialSummary(material: Material) {
    if (downloadingSummaryId) return;

    if (!hasText(material.summary_1)) return;
    const summary = material.summary_1 as string;

    // Opened here, synchronously, while the tap is still the current user
    // gesture. Every statement below this is async, and a popup requested
    // after an await is blocked — which would leave nothing to print into.
    const printWindow = openPrintWindow();

    setDownloadingSummaryId(material.id);

    try {
      let preparedFor: string | null = null;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (user) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .maybeSingle();

        preparedFor = profileRow?.full_name || profileRow?.username || null;
      }

      const logoDataUri = await getLogoDataUri();

      const html = buildSummaryHtml({
        logoDataUri,
        materialTitle: material.title,
        courseCode: selectedCourse?.code,
        courseTitle: selectedCourse?.title,
        topicTitle: selectedTopic?.title,
        department: selectedCourse?.department,
        level: selectedCourse?.level,
        preparedFor,
        summary,
      });

      // expo-print has no working web implementation: printToFileAsync there
      // is `window.print(); return undefined`, and this line used to
      // destructure { uri, base64 } straight off that. The browser's own
      // print-to-PDF is the only route to a real PDF file, so drive it from a
      // hidden iframe carrying the same HTML the native path renders.
      // The title IS the suggested PDF filename — see print-html.ts.
      await printHtmlDocument(html, summaryPrintTitle(material.title), printWindow);
    } catch (error: any) {
      console.log("SUMMARY PDF ERROR:", error);

      // Never strand the blank popup we opened up front.
      try {
        if (printWindow && !printWindow.closed) printWindow.close();
      } catch {
        // Already gone.
      }

      showAlert(
        "error",
        "Download Failed",
        error?.message || "Could not generate this summary as a PDF. Please try again."
      );
    } finally {
      setDownloadingSummaryId(null);
    }
  }
  function moveToNextQuickCard(nextHardCardIds = hardCardIds) {
    if (quickDeck.length === 0) return;
    const nextIndex = quickCardIndex + 1;
    if (!reviewMode && !hardReviewMode && nextIndex >= questions.length) {
      if (nextHardCardIds.length > 0) {
        setHardReviewMode(true);
        setReviewMode(false);
        setQuickCardIndex(0);
        setShowBack(false);
        return;
      }
      if (savedCardIds.length > 0) {
        setReviewMode(true);
        setQuickCardIndex(0);
        setShowBack(false);
        return;
      }
      setQuickCardIndex(0);
      setShowBack(false);
      return;
    }
    if (hardReviewMode && nextIndex >= quickDeck.length) {
      setHardReviewMode(false);
      setHardCardIds([]);
      if (savedCardIds.length > 0) {
        setReviewMode(true);
        setQuickCardIndex(0);
        setShowBack(false);
        return;
      }
      setQuickCardIndex(0);
      setShowBack(false);
      return;
    }
    if (reviewMode && nextIndex >= quickDeck.length) {
      setQuickCardIndex(0);
      setShowBack(false);
      return;
    }
    setQuickCardIndex(nextIndex);
    setShowBack(false);
  }
  function rateQuickCard(rating: FlashRating) {
    const current = currentQuickCard;
    if (!current) return;
    setQuickCardRatings((prev) => ({
      ...prev,
      [current.id]: rating,
    }));
    let nextHardCardIds = hardCardIds;
    if (rating === "Save") {
      setSavedCardIds((prev) => {
        if (prev.includes(current.id)) return prev;
        return [...prev, current.id];
      });
    }
    if (rating === "Hard" && !hardReviewMode) {
      nextHardCardIds = hardCardIds.includes(current.id)
        ? hardCardIds
        : [...hardCardIds, current.id];
      setHardCardIds(nextHardCardIds);
    }
    requestAnimationFrame(() => {
      updateStudyProgress({
        questionId: current.id,
        progressPercent: rating === "Good" ? 35 : rating === "Hard" ? 25 : 15,
        quickCardRating: rating,
      });
    });
    if (rating === "Again") {
      setShowBack(false);
      return;
    }
    if (rating === "Hard") {
      moveToNextQuickCard(nextHardCardIds);
      return;
    }
    moveToNextQuickCard(nextHardCardIds);
  }
  async function openMaterial(material: Material) {
    const kind = getMaterialKind(material.type);
    const url = material.file_url || material.video_url;

    // Count a material once per day. Reopening it still refreshes progress,
    // it just doesn't move the goal again.
    const countIt = await shouldCountMaterialToday(String(material.id));

    requestAnimationFrame(() => {
      updateStudyProgress({
        materialOpened: countIt,
        progressPercent: 10,
      });
    });
    if (kind === "video") {
      if (!url) {
        showAlert("warning", "No Video Yet", "This video is not available yet.");
        return;
      }
      Linking.openURL(url);
      return;
    }
    if (!url && !hasText(material.content)) {
      showAlert(
        "warning",
        "No Material Yet",
        "This material is not available yet."
      );
      return;
    }
    setMaterialViewer({
      visible: true,
      material,
    });
  }
  function closeMaterialViewer() {
    setMaterialViewer({
      visible: false,
      material: null,
    });
  }
  async function goBack() {
    if (selectedTopic) {
      setSelectedTopic(null);
      setActiveTab("Topics");
      setQuestions([]);
      setMaterials([]);
      setSelectedAnswers({});
      setQuestionIndex(0);
      resetQuickCards();
      return;
    }
    if (selectedCourse) {
      setSelectedCourse(null);
      setTopics([]);
      setActiveTab("Topics");
      return;
    }
    router.back();
  }
  function renderHeader() {
    if (!selectedCourse) {
      return (
        <View style={styles.topHeader}>
          {/* The title shrinks and the row tightens as you scroll, so the
              header gives its space back to the content instead of holding
              a fixed block. */}
          <Animated.View
            style={[
              styles.flex1,
              {
                transform: [{ scale: headerCollapsed ? 0.82 : 1 }],
                transformOrigin: "left center",
                transitionProperty: "transform",
                transitionDuration: motionTokens.base,
              },
            ]}
          >
            <Text style={[styles.pageTitle, { color: theme.text }]}>Course Library</Text>
          </Animated.View>

          <TouchableOpacity
            onPress={() => router.push("/notifications" as any)}
            hitSlop={10}
            style={[styles.headerIcon, { backgroundColor: theme.card }]}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={theme.accent} />
          </TouchableOpacity>
        </View>
      );
    }
    const tone = selectedCourseTheme.color;

    return (
      <View style={styles.heroWrap}>
        <View style={styles.heroBar}>
          <TouchableOpacity onPress={goBack} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text} />
          </TouchableOpacity>

          <View
            style={[
              styles.statPill,
              { backgroundColor: withAlpha(tone, isDark ? 0.24 : 0.16) },
            ]}
          >
            <Text style={[styles.statPillText, { color: tone }]}>
              {topics.length} topics
            </Text>
          </View>
        </View>

        {/* Toned by the course, not a hardcoded dark panel — the old one was
            navy in light mode too. */}
        <Card
          theme={theme}
          tone={tone}
          backgroundColor={theme.card}
          borderColor={theme.border}
          shadowColor={theme.shadow}
          radiusSize="xl"
          style={styles.studyHero}
        >
          <View style={styles.heroTop}>
            <IconPlate theme={theme} icon={selectedCourseTheme.icon} color={tone} size="lg" />

            <View style={styles.flex1}>
              <Text style={[styles.heroCode, { color: tone }]}>
                {selectedCourse.code}
              </Text>
              <Text style={[styles.heroTitle, { color: theme.text }]}>
                {selectedCourse.title}
              </Text>
            </View>
          </View>

          <Text style={[styles.heroMeta, { color: theme.muted }]}>
            {selectedTopic
              ? selectedTopic.title
              : `${selectedCourse.department || "Course"} • ${selectedCourse.level || "Level"}`}
          </Text>

          {selectedTopic && (
            <View style={styles.contentStatsRow}>
              <SmallStat label="Questions" value={questions.length} color={category.yellow} />
              <SmallStat label="Materials" value={materials.length} color={category.blue} />
              <SmallStat label="Cards" value={questions.length} color={category.green} />
            </View>
          )}
        </Card>
      </View>
    );
  }
  /**
   * The course search. Extracted so it can appear in two places: above the
   * library when browsing, and at the top of the rail once a course is open.
   * Previously it only existed in the browse header, so on the two-pane layout
   * the course list was permanently visible but no longer searchable.
   */
  function renderSearchBox() {
    return (
    <View style={[styles.searchBox, { backgroundColor: theme.card }]}>
      <MaterialCommunityIcons name="magnify" size={20} color={theme.muted} />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search courses"
        placeholderTextColor={theme.muted}
        style={[styles.searchInput, noFocusRing, { color: theme.text }]}
      />
      {search.length > 0 ? (
        <TouchableOpacity onPress={() => setSearch("")} hitSlop={10}>
          <MaterialCommunityIcons name="close-circle" size={18} color={theme.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
    );
  }

  function renderCourseFixedTop() {
    return (
      <Animated.View
        style={[
          styles.courseFixedTop,
          {
            backgroundColor: theme.bg,
            paddingBottom: headerCollapsed ? spacing.md : spacing.lg,
            transitionProperty: "padding-bottom",
            transitionDuration: motionTokens.base,
          },
        ]}
      >
        {renderHeader()}

        {renderSearchBox()}

        {/* Soft edge so folders dissolve under the header rather than being
            sliced by it. Fades in only once there is content beneath. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.headerFade,
            {
              opacity: headerCollapsed ? 1 : 0,
              transitionProperty: "opacity",
              transitionDuration: motionTokens.base,
            },
          ]}
        >
          {FADE_STEPS.map((step, i) => (
            <View
              key={i}
              style={[
                styles.headerFadeBand,
                { backgroundColor: withAlpha(theme.bg, step) },
              ]}
            />
          ))}
        </Animated.View>
      </Animated.View>
    );
  }

  /**
   * The course list, in the two roles it plays.
   *
   * "tiles" is the browse view — the full-presence tile, one per row on a
   * phone and three per row above the split. "rail" is the compact row beside
   * an open course, where a column of tiles would be a lot of scrolling to
   * change something you are already reading.
   */
  function renderCourseList(mode: "tiles" | "rail" = "tiles") {
    return (
      <>
        {loadingCourses ? (
          <View style={styles.skeletonList}>
            {[1, 2, 3].map((item) => (
              <View
                key={item}
                style={[
                  styles.skeletonCard,
                  { backgroundColor: surface, borderColor: theme.border },
                ]}
              >
                <View style={[styles.skeletonIcon, { backgroundColor: theme.soft }]} />
                <View style={{ flex: 1 }}>
                  <View style={[styles.skeletonLine, { backgroundColor: theme.soft }]} />
                  <View
                    style={[
                      styles.skeletonLineSmall,
                      { backgroundColor: theme.soft },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : filteredCourses.length === 0 ? (
          <EmptyState
            theme={theme}
            icon="book-search-outline"
            title="No assigned courses yet"
            text="No course matches your profile yet. Please check your department and level, then try again."
          />
        ) : (
          <View style={mode === "rail" ? styles.courseList : styles.courseGrid}>
            {filteredCourses.map((course) => {
              const courseTheme = getCourseTheme(course);
              const code = courseCode(course);
              const active = selectedCourse?.id === course.id;

              // The rail keeps a compact row: 320px of tiles would be a lot of
              // scrolling to change a course you are already reading.
              if (mode === "rail") {
                return (
                  <Pressable
                    key={course.id}
                    accessibilityRole="button"
                    accessibilityState={active ? { selected: true } : {}}
                    accessibilityLabel={[code, course.title].filter(Boolean).join(" ")}
                    onPress={() => openCourse(course)}
                    style={({ hovered }: any) => [
                      styles.courseRow,
                      hovered && !active ? { backgroundColor: withAlpha(theme.text, 0.04) } : null,
                      active ? { backgroundColor: withAlpha(courseTheme.color, 0.1) } : null,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={courseTheme.icon}
                      size={20}
                      color={courseTheme.color}
                    />
                    <Text style={[styles.courseRowName, { color: theme.text }]} numberOfLines={2}>
                      {course.title}
                    </Text>
                  </Pressable>
                );
              }

              return (
                <View
                  key={course.id}
                  style={[styles.courseCell, wide ? styles.courseCellWide : styles.courseCellFull]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={[code, course.title].filter(Boolean).join(" ")}
                    onPress={() => openCourse(course)}
                    style={({ pressed, hovered }: any) => [
                      styles.courseTile,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        ...elevation(hovered && !pressed ? 3 : 2, theme.shadow),
                        transform: [
                          { translateY: hovered && !pressed ? -2 : 0 },
                          { scale: pressed ? 0.985 : 1 },
                        ],
                        transitionProperty: "transform, box-shadow",
                        transitionDuration: motionTokens.fast,
                      },
                    ]}
                  >
                    <View style={styles.courseTileTop}>
                      {/* The one place the course hue appears. Background stays
                          neutral on purpose — a tinted tile made colour
                          decorative rather than identifying. */}
                      <MaterialCommunityIcons
                        name={courseTheme.icon}
                        size={28}
                        color={courseTheme.color}
                      />

                      {/* Absent codes drop the badge entirely rather than
                          rendering an empty pill. courseCode() is the same test
                          the sort uses. */}
                      {code ? (
                        <View style={[styles.courseBadge, { backgroundColor: theme.soft }]}>
                          <Text style={[styles.courseBadgeText, { color: theme.muted }]} numberOfLines={1}>
                            {code}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* No numberOfLines: the full course name always shows,
                        wrapping as far as it needs. minHeight reserves the
                        second line so a one-line name does not sit shorter
                        than its neighbours where there is no row to stretch
                        against. */}
                    <Text style={[styles.courseTileName, { color: theme.text }]}>
                      {course.title}
                    </Text>

                    <View style={styles.flex1} />

                    <Text style={[styles.courseMeta, { color: theme.muted }]} numberOfLines={1}>
                      {course.department && course.level
                        ? `${course.department} • ${course.level}`
                        : "Not assigned"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </>
    );
  }
  function renderTopicList() {
    if (loadingTopics) {
      return (
        <LoadingCard
          theme={theme}
          color={selectedCourseTheme.color}
          title="Loading topics..."
          text="Preparing the course structure."
        />
      );
    }
    if (topics.length === 0) {
      return (
        <EmptyState
          theme={theme}
          icon="book-alert-outline"
          title="No topics yet"
          text="No topics have been added for this course yet."
        />
      );
    }
    return (
      <View style={styles.list}>
        {topics.map((topic, index) => {
          const completed = completedTopicIds.has(String(topic.id));
          const saving = savingTopicId === topic.id;

          // Completed topics tone green; the rest tone with the course hue.
          const tone = completed ? theme.success : selectedCourseTheme.color;

          return (
            // One row per topic rather than a stacked card. The old version
            // spent a 32pt row on a "Done"/"Open" pill and another on a
            // full-width "Mark complete" button, both saying what the single
            // checkbox on the right now says — roughly 130pt per topic for one
            // line of information, so a course of ten topics was mostly
            // chrome.
            <Card
              key={topic.id}
              onPress={() => openTopic(topic)}
              theme={theme}
              tone={tone}
              backgroundColor={theme.card}
              borderColor={theme.border}
              shadowColor={theme.shadow}
              radiusSize="md"
              style={styles.topicRow}
            >
              <View
                style={[
                  styles.topicNumber,
                  { backgroundColor: withAlpha(tone, isDark ? 0.24 : 0.16) },
                ]}
              >
                <Text style={[styles.topicNumberText, { color: tone }]}>
                  {index + 1}
                </Text>
              </View>

              <View style={styles.topicRowText}>
                <Text
                  numberOfLines={1}
                  style={[styles.topicTitle, { color: theme.text }]}
                >
                  {topic.title}
                </Text>

                {topic.description ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.topicDesc, { color: theme.muted }]}
                  >
                    {topic.description}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                onPress={(event) => {
                  event.stopPropagation();
                  toggleTopicCompletion(topic);
                }}
                disabled={saving}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ checked: completed }}
                accessibilityLabel={
                  completed
                    ? `Mark ${topic.title} not complete`
                    : `Mark ${topic.title} complete`
                }
                style={[
                  styles.topicComplete,
                  { backgroundColor: withAlpha(tone, isDark ? 0.22 : 0.14) },
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={tone} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={completed ? "check-circle" : "check-circle-outline"}
                      size={15}
                      color={tone}
                    />
                    <Text style={[styles.topicCompleteText, { color: tone }]}>
                      {completed ? "Completed" : "Mark complete"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>
          );
        })}
      </View>
    );
  }
  function renderTabs() {
    if (!selectedTopic) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabPill,
                {
                  backgroundColor: active
                    ? selectedCourseTheme.color
                    : withAlpha(selectedCourseTheme.color, isDark ? 0.14 : 0.09),
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: active ? theme.onAccent : selectedCourseTheme.color },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }
  function renderQuestionMode() {
    if (loadingContent) {
      return (
        <LoadingCard
          theme={theme}
          color={selectedCourseTheme.color}
          title="Fetching questions..."
          text="Preparing your study questions."
        />
      );
    }
    if (questions.length === 0 || !currentQuestion) {
      return (
        <EmptyState
          theme={theme}
          icon="comment-question-outline"
          title="No questions yet"
          text="No questions have been added for this topic yet."
        />
      );
    }
    const selected = selectedAnswers[currentQuestion.id];
    const correct = currentQuestion.correct_answer.toUpperCase();
    const questionProgress = Math.round(((questionIndex + 1) / questions.length) * 100);
    const tone = selectedCourseTheme.color;
    const answered = Boolean(selected);
    const gotItRight = selected === correct;
    const options = getQuestionOptions(currentQuestion);

    return (
      <View style={styles.questionScreen}>
        {/* One representation of progress, not three. The old header carried
            "Question 3 of 12", "25%" and a bar — all the same fact. */}
        <View style={styles.questionHead}>
          <Text style={[styles.questionCount, { color: theme.muted }]}>
            {questionIndex + 1} of {questions.length}
          </Text>

          <View style={[styles.questionBar, { backgroundColor: theme.soft }]}>
            <Animated.View
              style={[
                styles.questionBarFill,
                {
                  width: `${questionProgress}%`,
                  backgroundColor: tone,
                  transitionProperty: "width",
                  transitionDuration: motionTokens.base,
                },
              ]}
            />
          </View>
        </View>

        <Text style={[styles.questionText, { color: theme.text }]}>
          {currentQuestion.question}
        </Text>

        {/* One grouped container with dividers, rather than four separate
            bordered cards nested inside a fifth. */}
        <View style={[styles.optionGroup, { backgroundColor: theme.card }]}>
          {options.map(([letter, value], index) => {
            const isSelected = selected === letter;
            const isCorrect = correct === letter;

            const rowTint = !answered
              ? "transparent"
              : isCorrect
                ? withAlpha(theme.success, isDark ? 0.2 : 0.12)
                : isSelected
                  ? withAlpha(theme.error, isDark ? 0.2 : 0.12)
                  : "transparent";

            const mark = !answered
              ? tone
              : isCorrect
                ? theme.success
                : isSelected
                  ? theme.error
                  : theme.muted;

            return (
              <View key={letter}>
                {index > 0 ? (
                  <View style={[styles.optionDivider, { backgroundColor: theme.border }]} />
                ) : null}

                <TouchableOpacity
                  onPress={() => chooseAnswer(currentQuestion, letter as string)}
                  activeOpacity={0.85}
                  style={[styles.option, { backgroundColor: rowTint }]}
                >
                  {/* The badge is the selection indicator — the old row had a
                      radio AND a letter doing the same job. */}
                  <View
                    style={[
                      styles.optionBadge,
                      {
                        backgroundColor:
                          answered && (isCorrect || isSelected)
                            ? mark
                            : withAlpha(tone, isDark ? 0.22 : 0.14),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionBadgeText,
                        {
                          color:
                            answered && (isCorrect || isSelected)
                              ? theme.onAccent
                              : tone,
                        },
                      ]}
                    >
                      {letter}
                    </Text>
                  </View>

                  <Text style={[styles.optionText, { color: theme.text }]}>{value}</Text>

                  {answered && (isCorrect || isSelected) ? (
                    <MaterialCommunityIcons
                      name={isCorrect ? "check-circle" : "close-circle"}
                      size={20}
                      color={mark}
                    />
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {answered && (
          <View
            style={[
              styles.feedback,
              {
                backgroundColor: withAlpha(
                  gotItRight ? theme.success : theme.error,
                  isDark ? 0.18 : 0.11,
                ),
              },
            ]}
          >
            <View style={styles.feedbackHead}>
              <MaterialCommunityIcons
                name={gotItRight ? "check-circle" : "close-circle"}
                size={18}
                color={gotItRight ? theme.success : theme.error}
              />
              <Text
                style={[
                  styles.feedbackTitle,
                  { color: gotItRight ? theme.success : theme.error },
                ]}
              >
                {gotItRight ? "Correct" : `Answer: ${correct}`}
              </Text>
            </View>

            {!gotItRight ? (
              <Text style={[styles.feedbackAnswer, { color: theme.text }]}>
                {answerText(currentQuestion)}
              </Text>
            ) : null}

            <Text style={[styles.explanation, { color: theme.muted }]}>
              {currentQuestion.explanation || "No explanation uploaded yet."}
            </Text>
          </View>
        )}

        <View style={styles.questionNav}>
          <TouchableOpacity
            onPress={previousQuestion}
            disabled={questionIndex === 0}
            style={[
              styles.navBtn,
              {
                backgroundColor: theme.card,
                opacity: questionIndex === 0 ? 0.4 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="arrow-left" size={18} color={theme.text} />
            <Text style={[styles.navText, { color: theme.text }]}>Previous</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={nextQuestion}
            disabled={questionIndex === questions.length - 1}
            style={[
              styles.navBtn,
              {
                backgroundColor: tone,
                opacity: questionIndex === questions.length - 1 ? 0.4 : 1,
              },
            ]}
          >
            {/* Was theme.text on an accent fill — dark-on-orange. */}
            <Text style={[styles.navText, { color: theme.onAccent }]}>Next</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color={theme.onAccent} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  function renderMaterials() {
    if (loadingContent) {
      return (
        <LoadingCard
          theme={theme}
          color={selectedCourseTheme.color}
          title="Loading materials..."
          text="Fetching files, notes and video links."
        />
      );
    }
    if (materials.length === 0) {
      return (
        <EmptyState
          theme={theme}
          icon="file-search-outline"
          title="No materials yet"
          text="No materials have been added for this topic yet."
        />
      );
    }
    return (
      <View style={styles.list}>
        {materials.map((material) => {
          const materialTheme = getMaterialTheme(material.type);
          const tone = materialTheme.color;
          const hasSummary = getSummaryPoints(material).length > 0;
          const expanded = expandedSummaryId === String(material.id);
          const isDownloading = downloadingSummaryId === material.id;

          return (
            <Card
              key={material.id}
              theme={theme}
              tone={tone}
              backgroundColor={theme.card}
              borderColor={theme.border}
              shadowColor={theme.shadow}
              radiusSize="lg"
              style={styles.materialCard}
            >
              <Pressable
                onPress={() => openMaterial(material)}
                style={styles.materialHead}
              >
                <IconPlate theme={theme} icon={materialTheme.icon} color={tone} size="md" />

                <View style={styles.flex1}>
                  <Text style={[styles.materialTitle, { color: theme.text }]}>
                    {material.title}
                  </Text>

                  <View
                    style={[
                      styles.materialTag,
                      { backgroundColor: withAlpha(tone, isDark ? 0.24 : 0.16) },
                    ]}
                  >
                    <Text style={[styles.materialTagText, { color: tone }]}>
                      {material.type.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <MaterialCommunityIcons
                  name={
                    getMaterialKind(material.type) === "video"
                      ? "open-in-new"
                      : "eye-outline"
                  }
                  size={22}
                  color={withAlpha(tone, 0.75)}
                />
              </Pressable>

              {hasSummary ? (
                <View>
                  <Pressable
                    onPress={() => {
                      haptics.tap();
                      setExpandedSummaryId(expanded ? null : String(material.id));
                    }}
                    style={[styles.summaryToggle, { borderTopColor: withAlpha(tone, 0.25) }]}
                  >
                    <MaterialCommunityIcons
                      name="text-box-outline"
                      size={17}
                      color={tone}
                    />
                    <Text style={[styles.summaryToggleText, { color: tone }]}>
                      Summary
                    </Text>

                    <Animated.View
                      style={{
                        transform: [{ rotate: expanded ? "180deg" : "0deg" }],
                        transitionProperty: "transform",
                        transitionDuration: motionTokens.fast,
                      }}
                    >
                      <MaterialCommunityIcons name="chevron-down" size={20} color={tone} />
                    </Animated.View>
                  </Pressable>

                  {expanded ? (
                    <View style={styles.summaryBody}>
                      <Text style={[styles.summaryText, { color: theme.muted }]}>
                        {getSummary(material)}
                      </Text>

                      <TouchableOpacity
                        onPress={() => downloadMaterialSummary(material)}
                        disabled={isDownloading}
                        style={[
                          styles.downloadButton,
                          {
                            backgroundColor: withAlpha(tone, isDark ? 0.24 : 0.16),
                            opacity: isDownloading ? 0.6 : 1,
                          },
                        ]}
                      >
                        {isDownloading ? (
                          <ActivityIndicator size="small" color={tone} />
                        ) : (
                          <MaterialCommunityIcons
                            name="tray-arrow-down"
                            size={17}
                            color={tone}
                          />
                        )}
                        <Text style={[styles.downloadButtonText, { color: tone }]}>
                          {isDownloading ? "Preparing…" : "Download PDF"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
    );
  }
  function renderQuickCards() {
    if (questions.length === 0 || !currentQuickCard) {
      return (
        <EmptyState
          theme={theme}
          icon="cards-outline"
          title="No cards yet"
          text="Cards are automatically generated from uploaded questions."
        />
      );
    }
    const tone = selectedCourseTheme.color;
    const deckLabel = hardReviewMode
      ? "Hard review"
      : reviewMode
        ? "Saved review"
        : "Quick cards";
    const deckProgress =
      quickDeck.length > 0 ? ((quickCardIndex + 1) / quickDeck.length) * 100 : 0;

    const ratings: { key: FlashRating; icon: IconName; color: string }[] = [
      { key: "Again", icon: "refresh", color: theme.error },
      { key: "Hard", icon: "alert-outline", color: theme.warning },
      { key: "Good", icon: "check", color: theme.success },
      { key: "Save", icon: "bookmark-outline", color: theme.info },
    ];

    return (
      <View style={styles.quickCardScreen}>
        <View style={styles.quickTopRow}>
          <Text style={[styles.quickCount, { color: theme.muted }]}>
            {deckLabel} · {quickCardIndex + 1} of {quickDeck.length}
          </Text>

          {savedCardIds.length > 0 && !hardReviewMode && (
            <TouchableOpacity
              onPress={() => {
                setReviewMode(!reviewMode);
                setQuickCardIndex(0);
                setShowBack(false);
              }}
              hitSlop={8}
            >
              <Text style={[styles.savedToggle, { color: tone }]}>
                {reviewMode ? "All cards" : `${savedCardIds.length} saved`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Where you are in the deck — the old header said "3 of 12" but gave
            no sense of how much was left. */}
        <View style={[styles.deckTrack, { backgroundColor: theme.soft }]}>
          <Animated.View
            style={[
              styles.deckFill,
              {
                width: `${deckProgress}%`,
                backgroundColor: tone,
                transitionProperty: "width",
                transitionDuration: motionTokens.base,
              },
            ]}
          />
        </View>

        <Pressable onPress={() => setShowBack(!showBack)}>
          <Animated.View
            style={[
              styles.quickCard,
              {
                backgroundColor: withAlpha(tone, isDark ? 0.16 : 0.09),
                borderColor: withAlpha(tone, isDark ? 0.32 : 0.24),
                // A small hinge on flip, rather than the content just swapping.
                transform: [{ perspective: 700 }, { rotateX: showBack ? "3deg" : "0deg" }],
                transitionProperty: "transform, background-color",
                transitionDuration: motionTokens.base,
              },
            ]}
          >
            <View
              style={[
                styles.quickChip,
                { backgroundColor: withAlpha(tone, isDark ? 0.26 : 0.18) },
              ]}
            >
              <MaterialCommunityIcons
                name={showBack ? "lightbulb-on-outline" : "help-circle-outline"}
                size={14}
                color={tone}
              />
              <Text style={[styles.quickChipText, { color: tone }]}>
                {showBack ? "Answer" : "Question"}
              </Text>
            </View>

            <Text style={[styles.quickText, { color: theme.text }]}>
              {showBack ? answerText(currentQuickCard) : currentQuickCard.question}
            </Text>

            <View style={styles.tapRow}>
              <MaterialCommunityIcons
                name="gesture-tap"
                size={15}
                color={theme.muted}
              />
              <Text style={[styles.tapText, { color: theme.muted }]}>
                Tap to {showBack ? "see the question" : "reveal the answer"}
              </Text>
            </View>
          </Animated.View>
        </Pressable>

        {showBack && (
          <View style={styles.ratingGrid}>
            {ratings.map(({ key, icon, color }) => (
              <TouchableOpacity
                key={key}
                onPress={() => rateQuickCard(key)}
                style={[
                  styles.ratingBtn,
                  { backgroundColor: withAlpha(color, isDark ? 0.22 : 0.14) },
                ]}
              >
                <MaterialCommunityIcons name={icon} size={18} color={color} />
                <Text style={[styles.ratingText, { color }]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={moveToNextQuickCard}
          style={[styles.nextBtn, { backgroundColor: tone }]}
        >
          <Text style={[styles.nextText, { color: theme.onAccent }]}>Next card</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={theme.onAccent} />
        </TouchableOpacity>
      </View>
    );
  }
  function renderMaterialViewer() {
    const material = materialViewer.material;
    if (!material) return null;
    const kind = getMaterialKind(material.type);
    const url = getInAppUrl(material);
    const rawUrl = material.file_url || material.video_url || "";
    const isGooglePreview = Boolean(getGoogleDrivePreviewUrl(rawUrl));
    const html =
      kind === "image" && rawUrl
        ? `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>
                body {
                  margin: 0;
                  background: #07101F;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                }
                img {
                  max-width: 100%;
                  height: auto;
                  border-radius: 18px;
                }
              </style>
            </head>
            <body>
              <img src="${rawUrl}" />
            </body>
          </html>
        `
        : "";
    return (
      <Modal
        visible={materialViewer.visible}
        animationType="slide"
        onRequestClose={closeMaterialViewer}
      >
        <View style={[styles.viewerScreen, { backgroundColor: theme.bg }]}>
          <View
            style={[
              styles.viewerHeader,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <TouchableOpacity onPress={closeMaterialViewer} style={styles.viewerCloseBtn}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.viewerTitle, { color: theme.text }]}>
                {material.title}
              </Text>
              <Text style={[styles.viewerMeta, { color: theme.muted }]}>
                {String(material.type || "Material").toUpperCase()}
              </Text>
            </View>
            {rawUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(rawUrl)}
                style={styles.viewerExternalBtn}
              >
                <MaterialCommunityIcons name="open-in-new" size={20} color={theme.orange} />
              </TouchableOpacity>
            ) : null}
          </View>
          {kind === "note" || (!url && hasText(material.content)) ? (
            <ScrollView contentContainerStyle={styles.noteViewerContent}>
              <Text style={[styles.noteViewerText, { color: theme.text }]}>
                {material.content || "No note has been added for this material yet."}
              </Text>
            </ScrollView>
          ) : kind === "image" && rawUrl ? (
            <MaterialFrame
              key={rawUrl}
              theme={theme}
              html={html}
              onOpenExternal={() => Linking.openURL(rawUrl)}
            />
          ) : url ? (
            <View style={{ flex: 1 }}>
              {(kind === "pdf" || isGooglePreview) && (
                <View
                  style={[
                    styles.pdfNotice,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="file-pdf-box"
                    size={18}
                    color={theme.orange}
                  />
                  <Text style={[styles.pdfNoticeText, { color: theme.muted }]}>
                    Google Drive preview may take a few seconds. If it fails, use the open button above.
                  </Text>
                </View>
              )}
              <MaterialFrame
                key={url}
                theme={theme}
                url={url}
                onOpenExternal={() => Linking.openURL(rawUrl)}
              />
            </View>
          ) : (
            <EmptyState
              theme={theme}
              icon="file-alert-outline"
              title="Material unavailable"
              text="This material is not available yet."
            />
          )}
        </View>
      </Modal>
    );
  }
  function renderActiveContent() {
    if (!selectedTopic) return renderTopicList();
    if (activeTab === "Questions") return renderQuestionMode();
    if (activeTab === "Materials") return renderMaterials();
    if (activeTab === "Cards") return renderQuickCards();
    return renderTopicList();
  }
  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.backgroundWash,
          {
            backgroundColor: isDark
              ? "rgba(59,130,246,0.026)"
              : "rgba(249,115,22,0.035)",
          },
        ]}
      />
      {!selectedCourse && renderCourseFixedTop()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const next = event.nativeEvent.contentOffset.y > 12;
          if (next !== headerCollapsed) setHeaderCollapsed(next);
        }}
        contentContainerStyle={[styles.scroll, !selectedCourse && styles.courseOnlyScroll, contentInset]}
      >
        {/* Three states, not two. Browsing wants the whole width for the
            grid; an open course wants a narrow list beside real content.
            Collapsing those into one layout is what made the library a
            single column on a 1500px screen. */}
        {wide && !selectedCourse ? renderCourseList("tiles") : null}

        {wide && selectedCourse ? (
          <SplitPane
            theme={theme}
            railWidth={COURSE_RAIL}
            divider={false}
            rail={
              <View>
                {/* Search lives with the list it filters, so it stays usable
                    while a course is open — the whole point of keeping the
                    list on screen. */}
                <View style={styles.railSearch}>{renderSearchBox()}</View>

                {/* The list stays put. Picking a course used to replace it,
                    so switching courses meant navigating back first. */}
                {renderCourseList("rail")}
              </View>
            }
          >
            {renderHeader()}
            {renderTabs()}
            {renderActiveContent()}
          </SplitPane>
        ) : null}

        {!wide ? (
          <>
            {selectedCourse && renderHeader()}
            {!selectedCourse && renderCourseList("tiles")}
            {selectedCourse && (
              <>
                {renderTabs()}
                {renderActiveContent()}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
      {renderMaterialViewer()}
      <AlertModal
        theme={theme}
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        primaryLabel="OK"
        onPrimary={closeAlert}
        onRequestClose={closeAlert}
      />
    </View>
  );
}
function SmallStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.smallStat}>
      <Text style={[styles.smallStatValue, { color }]}>{value}</Text>
      <Text style={styles.smallStatLabel}>{label}</Text>
    </View>
  );
}
function LoadingCard({
  theme,
  color,
  title,
  text,
}: {
  theme: any;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ActivityIndicator size="small" color={color} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: theme.muted }]}>{text}</Text>
    </View>
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
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  backgroundWash: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    height: "100%",
  },
  scroll: {
    paddingTop: 46,
    paddingHorizontal: 18,
    paddingBottom: 132,
  },
  courseOnlyScroll: {
    paddingTop: 10,
  },
  list: {
    gap: 14,
  },
  // --- course tiles --------------------------------------------------------
  //
  // ELEVATION EXCEPTION, DELIBERATE. The tokens pass removed shadows almost
  // everywhere: depth on the web comes from a border and a background step,
  // and floating containers were what made every screen read like a phone.
  // Course tiles are the exception, and only they are: they are the primary
  // tappable object in the app, and a tap target should feel liftable. This is
  // not a signal to restore shadows on Settings, Premium, Profile or anywhere
  // a container merely groups content. Do not "fix" this by flattening it.
  railSearch: {
    marginBottom: 14,
  },
  courseList: {
    gap: 2,
  },
  courseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: -spacing.md,
    borderRadius: radius.sm,
  },
  courseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    // Rows pack from the top; they never distribute leftover height between
    // themselves, which is what produced uneven gaps before.
    alignContent: "flex-start",
  },
  courseCell: {
    flexGrow: 1,
    minWidth: 0,
    // The cell is a flex container so the tile inside can fill it. That is
    // what makes align-items: stretch CORRECT here — every tile in a row
    // matches height with no dead space, unlike the folder body that used to
    // keep its natural height inside a stretched cell.
    flexDirection: "row",
  },
  // 31% caps the row at three: four would need 124% before gaps.
  courseCellWide: {
    flexBasis: "31%",
  },
  courseCellFull: {
    flexBasis: "100%",
  },
  courseTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  courseTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  courseBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  courseBadgeText: {
    ...typeScale.micro,
    letterSpacing: 0.5,
  },
  courseTileName: {
    ...typeScale.section,
    // Two lines of section (24pt each), reserved so a one-line course does not
    // sit shorter than its neighbours on narrow, where there is no row.
    minHeight: 48,
  },
  // Compact row, rail only.
  courseRowName: {
    flex: 1,
    minWidth: 0,
    ...typeScale.body,
    fontWeight: weight.semi,
  },
  folderTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  heroWrap: {
    marginBottom: spacing.xl,
  },
  heroBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  backButton: {
    marginLeft: -spacing.sm,
  },
  statPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statPillText: {
    ...typeScale.caption,
    letterSpacing: 0,
  },
  studyHero: {
    padding: spacing.xl,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  heroCode: {
    ...typeScale.micro,
    letterSpacing: 0.8,
  },
  heroTitle: {
    ...typeScale.title,
    marginTop: spacing.xxs,
  },
  heroMeta: {
    ...typeScale.body,
    fontWeight: weight.regular,
    marginTop: spacing.lg,
  },
  contentStatsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  courseTitle: {
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
  smallStat: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 10,
  },
  smallStatValue: {
    fontSize: 17,
    fontWeight: "900",
  },
  smallStatLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(248,244,234,0.65)",
  },
  tabRow: {
    gap: 10,
    paddingBottom: 18,
  },
  flex1: {
    flex: 1,
  },
  tabPill: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    ...typeScale.body,
    fontWeight: weight.semi,
  },
  // One compact row per topic. The number badge is the admin's ordering,
  // the checkbox is the completion state, and nothing else earns a line.
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topicRowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  // The completion control keeps its text label — a bare checkbox leaves the
  // reader to infer what ticking it means. It sits inline on the row rather
  // than on its own line below, which is where the height went before.
  //
  // flexShrink: 0 so a long topic title truncates instead of squeezing the
  // label to the point where it wraps.
  topicComplete: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 32,
    flexShrink: 0,
  },
  topicCompleteText: {
    ...typeScale.caption,
    letterSpacing: 0,
  },
  topicNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  topicNumberText: {
    ...typeScale.bodyStrong,
  },
  topicTitle: {
    ...typeScale.body,
    fontWeight: weight.semi,
  },
  topicDesc: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  materialCard: {
    padding: spacing.lg,
  },
  materialHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  summaryToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    minHeight: 40,
  },
  summaryToggleText: {
    ...typeScale.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
    flex: 1,
  },
  summaryBody: {
    marginTop: spacing.md,
    gap: spacing.md,
  },

  courseFixedTop: {
    paddingTop: 42,
    paddingHorizontal: layout.screenGutter,
    zIndex: 10,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  pageTitle: {
    ...typeScale.display,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: {
    flex: 1,
    ...typeScale.body,
    fontWeight: weight.regular,
    paddingVertical: 0,
  },
  // Stacked bands approximate a gradient without pulling in a gradient lib —
  // expo-linear-gradient isn't a dependency here.
  headerFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -FADE_HEIGHT,
    height: FADE_HEIGHT,
  },
  headerFadeBand: {
    flex: 1,
  },

  questionScreen: {
    gap: spacing.lg,
  },
  questionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  questionCount: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  questionBar: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  questionBarFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  questionText: {
    ...typeScale.section,
  },
  optionGroup: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 30 + spacing.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
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
  optionText: {
    ...typeScale.body,
    fontWeight: weight.regular,
    flex: 1,
  },
  feedback: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  feedbackHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  feedbackTitle: {
    ...typeScale.body,
    fontWeight: weight.bold,
  },
  feedbackAnswer: {
    ...typeScale.body,
    fontWeight: weight.medium,
  },
  explanation: {
    ...typeScale.body,
    fontWeight: weight.regular,
  },
  questionNav: {
    flexDirection: "row",
    gap: spacing.md,
  },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  navText: {
    ...typeScale.body,
    fontWeight: weight.bold,
  },

  quickCardScreen: {
    gap: spacing.lg,
  },
  quickTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  quickCount: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  savedToggle: {
    ...typeScale.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
  },
  deckTrack: {
    height: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: -spacing.sm,
  },
  deckFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  quickCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    minHeight: 220,
    gap: spacing.lg,
  },
  quickChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  quickChipText: {
    ...typeScale.micro,
    letterSpacing: 0.4,
  },
  quickText: {
    ...typeScale.section,
    flex: 1,
  },
  tapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  tapText: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  ratingGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ratingBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 64,
  },
  ratingText: {
    ...typeScale.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
  },
  nextBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
  },
  nextText: {
    ...typeScale.body,
    fontWeight: weight.bold,
  },
  materialTitle: {
    ...typeScale.bodyLg,
    fontWeight: weight.semi,
  },
  materialTag: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  materialTagText: {
    ...typeScale.micro,
    letterSpacing: 0.4,
  },
  smallIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  downloadButtonText: {
    fontSize: 11,
    fontWeight: "900",
  },
  generatingBox: {
    marginTop: 12,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  generatingText: {
    fontSize: 13,
    fontWeight: "800",
  },
  regenerateBtn: {
    marginTop: 15,
    height: 46,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  regenerateText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  skeletonList: {
    gap: 14,
  },
  skeletonCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 16,
    flexDirection: "row",
    gap: 14,
  },
  skeletonIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
  },
  skeletonLine: {
    height: 18,
    borderRadius: 999,
    width: "80%",
    marginTop: 6,
  },
  skeletonLineSmall: {
    height: 14,
    borderRadius: 999,
    width: "54%",
    marginTop: 10,
  },
  emptyCard: {
    borderRadius: 30,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 210,
  },
  emptyTitle: {
    marginTop: 14,
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
  viewerScreen: {
    flex: 1,
  },
  viewerHeader: {
    paddingTop: 46,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  viewerCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(249,115,22,0.12)",
  },
  viewerExternalBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(249,115,22,0.12)",
  },
  viewerTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  viewerMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  pdfNotice: {
    minHeight: 42,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pdfNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  webLoading: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  webLoadingText: {
    fontSize: 13,
    fontWeight: "800",
  },
  noteViewerContent: {
    padding: 20,
    paddingBottom: 70,
  },
  noteViewerText: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: "700",
  },
});