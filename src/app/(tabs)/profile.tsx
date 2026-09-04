import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { usePremium } from "../../premium";
import { category, useThemeMode, type AlertType, type Theme } from "../../theme";
import { useContentInset } from "../../ui/layout/breakpoints";
import { AlertModal } from "../../ui/AlertModal";
import { AnimatedSection } from "../../ui/AnimatedSection";
import { PrimaryButton } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { haptics } from "../../ui/haptics";
import { dividerInset, ListRow, ListSection } from "../../ui/List";
import { PageHeader } from "../../ui/PageHeader";
import { Screen } from "../../ui/Screen";
import {
  layout,
  noFocusRing,
  radius,
  spacing,
  type,
  weight,
  withAlpha,
} from "../../ui/tokens";

type Profile = {
  id: string;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
  school?: string | null;
  faculty?: string | null;
  department?: string | null;
  level?: string | null;
  role?: string | null;
  profile_completed?: boolean | null;
  avatar_url?: string | null;
  created_at?: string | null;
};

type ProgressSummary = {
  questions_studied: number | null;
  questions_correct: number | null;
  materials_opened: number | null;
  progress_percent: number | null;
};

type ActivityLog = {
  mode: "study" | "practice" | "exam" | string;
  duration_seconds: number | null;
  xp_earned: number | null;
  accuracy_percent: number | null;
};

const FALLBACK_PROFILE: Profile = {
  id: "demo",
  username: "Student",
  email: "student@lasuscholar.app",
  school: "LASU",
  faculty: "Faculty",
  department: "Department",
  level: "Level",
  role: "student",
  avatar_url: null,
};

export default function ProfilePage() {
  const contentInset = useContentInset();
  const { theme } = useThemeMode();
  const { isPremium } = usePremium();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<ProgressSummary[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
    action: null as null | (() => void),
  });

  function showAlert(
    type: AlertType,
    title: string,
    message: string,
    action?: () => void
  ) {
    setAlert({
      visible: true,
      type,
      title,
      message,
      action: action || null,
    });
  }

  function closeAlert() {
    const action = alert.action;

    setAlert((prev) => ({
      ...prev,
      visible: false,
      action: null,
    }));

    if (action) {
      setTimeout(action, 180);
    }
  }

  async function loadProfile() {
    try {
      setLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        showAlert("error", "Profile Error", userError.message);
        setProfile(FALLBACK_PROFILE);
        return;
      }

      const user = userData.user;

      if (!user) {
        setProfile(FALLBACK_PROFILE);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        showAlert("error", "Profile Error", error.message);
        setProfile({
          ...FALLBACK_PROFILE,
          id: user.id,
          email: user.email,
        });
      } else {
        setProfile({
          ...FALLBACK_PROFILE,
          ...data,
          id: user.id,
          email: data?.email || user.email,
        });
      }

      const { data: progressData } = await supabase
        .from("user_progress")
        .select("questions_studied, questions_correct, materials_opened, progress_percent")
        .eq("user_id", user.id);

      setProgress(progressData || []);

      const { data: activityData } = await supabase
        .from("user_activity_logs")
        .select("mode, duration_seconds, xp_earned, accuracy_percent")
        .eq("user_id", user.id);

      setActivityLogs((activityData || []) as ActivityLog[]);

      const { data: xpData } = await supabase
        .from("xp_events")
        .select("xp")
        .eq("user_id", user.id);

      setTotalXp((xpData || []).reduce((sum: number, item: any) => sum + (item.xp || 0), 0));
    } finally {
      setLoading(false);
    }
  }

  async function init() {
    await loadProfile();
  }

  // Declared after the functions it calls so the compiler lint can see the
  // bindings — hoisting made this work either way, but the rule reads
  // lexical order.
  useEffect(() => {
    init();
  }, []);

  async function handleLogout() {
    showAlert(
      "warning",
      "Sign Out?",
      "You will need to sign in again to access your study dashboard.",
      async () => {
        setLoggingOut(true);
        const { error } = await supabase.auth.signOut();
        setLoggingOut(false);

        if (error) {
          showAlert("error", "Logout Failed", error.message);
          return;
        }

        router.replace("/auth/login");
      }
    );
  }

  async function uploadProfilePicture() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        showAlert("warning", "Permission Needed", "Please allow photo access to upload a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: false,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        showAlert("error", "Not Signed In", "Please sign in again to update your profile picture.");
        return;
      }

      setUploadingPhoto(true);

      const asset = result.assets[0];

      // Fetch the picked file as a Blob rather than reading it into a base64
      // string. `expo-file-system` is a no-op shim on web — its whole module
      // is `documentDirectory = null` with no methods — so
      // `readAsStringAsync` throws there and avatar upload could never work.
      // `fetch` handles the picker's `blob:` URI on web and `file://` on
      // native, so one path covers both, skips a ~33% base64 inflation, and
      // drops the `base64-arraybuffer` dependency.
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // The URI is where the old extension sniffing broke on web: a picker
      // result there looks like `blob:http://host/uuid` with no filename at
      // all, so every upload was labelled .jpg/image-jpeg regardless of what
      // was chosen. The asset's own mimeType is authoritative; the blob's is
      // the fallback.
      const contentType = asset.mimeType || blob.type || "image/jpeg";
      const safeExtension =
        {
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "image/jpeg": "jpg",
        }[contentType] || "jpg";

      const filePath = `${user.id}/avatar-${Date.now()}.${safeExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, blob, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        showAlert("error", "Upload Failed", uploadError.message);
        return;
      }

      const { data: publicData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);

      const avatarUrl = publicData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);

      if (updateError) {
        showAlert("error", "Profile Update Failed", updateError.message);
        return;
      }

      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      haptics.success();
      showAlert("success", "Profile Updated", "Your profile picture has been updated.");
    } catch (error: any) {
      haptics.error();
      showAlert("error", "Upload Error", error?.message || "Something went wrong while uploading your picture.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function openWhatsAppSupport() {
    Linking.openURL("https://wa.me/2347066884933");
  }

  function callSupport() {
    Linking.openURL("tel:+2347066884933");
  }

  function emailSupport() {
    Linking.openURL("mailto:support@lasuscholar.com");
  }

  function openReviewPage() {
    setReviewOpen(true);
  }

  async function submitReview() {
    const cleanReview = reviewText.trim();

    if (cleanReview.length < 10) {
      showAlert("warning", "Review Too Short", "Please write a short honest review before submitting.");
      return;
    }

    try {
      setSubmittingReview(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        showAlert("error", "Not Signed In", "Please sign in again to submit your review.");
        return;
      }

      const { error } = await supabase.from("app_reviews").insert({
        user_id: user.id,
        display_name: displayName,
        department: profile?.department || null,
        level: profile?.level || null,
        rating: reviewRating,
        review: cleanReview,
        status: "pending",
      });

      if (error) {
        showAlert("error", "Review Error", error.message);
        return;
      }

      setReviewOpen(false);
      setReviewText("");
      setReviewRating(5);

      haptics.success();
      showAlert(
        "success",
        "Review Submitted",
        "Thank you. Your review has been sent and can be used on the LASU Scholar website after approval.",
        () => Linking.openURL("https://lasuscholar.com/#reviews")
      );
    } finally {
      setSubmittingReview(false);
    }
  }

  const displayName = useMemo(() => {
    return profile?.username || profile?.full_name || "Student";
  }, [profile]);

  const initials = useMemo(() => {
    const base = displayName.trim() || "Student";
    const parts = base.split(" ").filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return base.slice(0, 2).toUpperCase();
  }, [displayName]);

  const totalQuestions = useMemo(() => {
    return progress.reduce((sum, item) => sum + (item.questions_studied || 0), 0);
  }, [progress]);

  const totalCorrect = useMemo(() => {
    return progress.reduce((sum, item) => sum + (item.questions_correct || 0), 0);
  }, [progress]);

  const totalMaterials = useMemo(() => {
    return progress.reduce((sum, item) => sum + (item.materials_opened || 0), 0);
  }, [progress]);

  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const averageProgress = useMemo(() => {
    if (progress.length === 0) return 0;

    const total = progress.reduce((sum, item) => sum + (item.progress_percent || 0), 0);
    return Math.round(total / progress.length);
  }, [progress]);

  const totalSeconds = useMemo(() => {
    return activityLogs.reduce((sum, item) => sum + (item.duration_seconds || 0), 0);
  }, [activityLogs]);

  const studyHours = totalSeconds > 0 ? (totalSeconds / 3600).toFixed(1) : "0";

  const practiceAverage = useMemo(() => {
    const practiceLogs = activityLogs.filter((item) => item.mode === "practice" && item.accuracy_percent !== null);

    if (practiceLogs.length === 0) return accuracy;

    const total = practiceLogs.reduce((sum, item) => sum + (item.accuracy_percent || 0), 0);
    return Math.round(total / practiceLogs.length);
  }, [activityLogs, accuracy]);

  const examAverage = useMemo(() => {
    const examLogs = activityLogs.filter((item) => item.mode === "exam" && item.accuracy_percent !== null);

    if (examLogs.length === 0) return 0;

    const total = examLogs.reduce((sum, item) => sum + (item.accuracy_percent || 0), 0);
    return Math.round(total / examLogs.length);
  }, [activityLogs]);

  if (loading) {
    return (
      <Screen backgroundColor={theme.bg}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingTitle, { color: theme.muted }]}>Loading profile</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        title="Profile"
        measure="app"
        onBack={() => router.back()}
        contentContainerStyle={[styles.scroll, contentInset]}
        right={
          <Pressable onPress={() => router.push("/settings")} hitSlop={12}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={theme.text} />
          </Pressable>
        }
      >
        <AnimatedSection index={0}>
          <View style={styles.identitySection}>
            {/* One rounded box for the avatar, not three. The ring and the
                inner Card were separate radii wrapping the same 96px circle. */}
            <Card
              onPress={uploadProfilePicture}
              backgroundColor={theme.accent}
              borderColor="transparent"
              shadowColor={theme.shadow}
              elevationLevel={1}
              hapticStyle="press"
              style={styles.avatar}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => {
                    setProfile((prev) => prev ? { ...prev, avatar_url: null } : prev);
                    showAlert("warning", "Image Load Error", "The uploaded image link could not be displayed. Please try uploading again.");
                  }}
                />
              ) : (
                <Text style={[styles.avatarText, { color: theme.onAccent }]}>{initials}</Text>
              )}

              <View
                style={[
                  styles.cameraBadge,
                  { backgroundColor: theme.text, borderColor: theme.card },
                ]}
              >
                <MaterialCommunityIcons name="camera" size={16} color={theme.card} />
              </View>
            </Card>

            <Text style={[styles.name, { color: theme.text }]}>{displayName}</Text>

            <Text style={[styles.email, { color: theme.muted }]}>
              {profile?.email || "No email available"}
            </Text>

            <View style={[styles.rolePill, { backgroundColor: theme.accentSoft }]}>
              <MaterialCommunityIcons name="school-outline" size={16} color={theme.accent} />
              <Text style={[styles.roleText, { color: theme.accent }]}>
                {(profile?.role || "student").toUpperCase()}
              </Text>
            </View>
          </View>
        </AnimatedSection>

        <AnimatedSection index={1}>
          <View style={styles.statsRow}>
            <StatBlock label="XP" value={String(totalXp)} theme={theme} />

            <StatBlock label="Accuracy" value={`${accuracy}%`} theme={theme} />

            <StatBlock label="Study Time" value={`${studyHours}h`} theme={theme} />

            <StatBlock label="Materials" value={String(totalMaterials)} theme={theme} />
          </View>
        </AnimatedSection>

        <AnimatedSection index={2}>
          <Card
            backgroundColor={theme.card}
            borderColor={theme.border}
            shadowColor={theme.shadow}
            radiusSize="lg"
            style={styles.progressPanel}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Performance</Text>

            <PerformanceBar label="Accuracy" value={accuracy} color={category.green} theme={theme} />
            <PerformanceBar label="Average Progress" value={averageProgress} color={category.orange} theme={theme} />
            <PerformanceBar label="Practice Average" value={practiceAverage} color={category.blue} theme={theme} />
            <PerformanceBar label="Exam Average" value={examAverage} color={category.purple} theme={theme} />
          </Card>
        </AnimatedSection>

        <AnimatedSection index={3}>
          <ListSection theme={theme} title="Academic identity" inset={dividerInset.none}>
            <ListRow
              theme={theme}
              label="School"
              value={profile?.school || "Not set"}
              chevron={false}
            />

            <ListRow
              theme={theme}
              label="Faculty"
              value={profile?.faculty || "Not set"}
              chevron={false}
            />

            <ListRow
              theme={theme}
              label="Department"
              value={profile?.department || "Not set"}
              chevron={false}
            />

            <ListRow
              theme={theme}
              label="Level"
              value={profile?.level || "Not set"}
              chevron={false}
            />
          </ListSection>
        </AnimatedSection>

        <AnimatedSection index={4}>
          <ListSection theme={theme} title="Account">
            <ListRow
              theme={theme}
              icon="account-edit-outline"
              label="Edit Profile"
              onPress={() => router.push("/edit-profile")}
            />

            <ListRow
              theme={theme}
              icon="cog-outline"
              label="Settings"
              onPress={() => router.push("/settings")}
            />

            <ListRow
              theme={theme}
              icon="lifebuoy"
              label="Help & Support"
              onPress={() => setSupportOpen(true)}
            />

            <ListRow
              theme={theme}
              icon="crown"
              iconColor={category.yellow}
              label="LASU Scholar Premium"
              value={isPremium ? "Premium member" : "Free"}
              onPress={() => router.push("/premium" as any)}
            />

            <ListRow
              theme={theme}
              icon="star-outline"
              label="Write a Review"
              onPress={openReviewPage}
            />
          </ListSection>

          <ListSection theme={theme} style={styles.signOut}>
            <ListRow
              theme={theme}
              label="Sign Out"
              destructive
              loading={loggingOut}
              onPress={handleLogout}
            />
          </ListSection>
        </AnimatedSection>
      </PageHeader>

      <Modal transparent visible={reviewOpen} animationType="fade">
        <View style={[styles.alertOverlay, { backgroundColor: theme.overlay }]}>
          <Card
            backgroundColor={theme.elevated}
            borderColor={theme.border}
            shadowColor={theme.shadow}
            radiusSize="lg"
            style={styles.reviewBox}
          >
            <View
              style={[
                styles.alertIconWrap,
                { backgroundColor: withAlpha(theme.accent, 0.13) },
              ]}
            >
              <MaterialCommunityIcons name="star-outline" size={34} color={theme.accent} />
            </View>

            <Text style={[styles.supportTitle, { color: theme.text }]}>Write a Review</Text>
            <Text style={[styles.supportMessage, { color: theme.muted }]}>
              Tell us how LASU Scholar is helping your study life.
            </Text>

            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => {
                    haptics.select();
                    setReviewRating(star);
                  }}
                >
                  <MaterialCommunityIcons
                    name={star <= reviewRating ? "star" : "star-outline"}
                    size={30}
                    color={theme.accent}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              placeholder="Write your review here..."
              placeholderTextColor={theme.muted}
              style={[
                styles.reviewInput,
                noFocusRing,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.input,
                },
              ]}
            />

            <PrimaryButton
              label={submittingReview ? "Submitting..." : "Submit Review"}
              onPress={submitReview}
              disabled={submittingReview}
              color={theme.accent}
              icon={
                submittingReview ? <ActivityIndicator color={theme.onAccent} /> : undefined
              }
            />

            <TouchableOpacity
              onPress={() => setReviewOpen(false)}
              style={[styles.reviewCancelButton, { borderColor: theme.border }]}
            >
              <Text style={[styles.reviewCancelText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </Modal>

      <Modal transparent visible={supportOpen} animationType="fade">
        <View style={[styles.alertOverlay, { backgroundColor: theme.overlay }]}>
          <Card
            backgroundColor={theme.elevated}
            borderColor={theme.border}
            shadowColor={theme.shadow}
            radiusSize="lg"
            style={styles.supportBox}
          >
            <Text style={[styles.supportTitle, { color: theme.text }]}>Help & Support</Text>

            {/* `plain` so these rows don't draw a second card inside the
                dialog's own card. */}
            <ListSection theme={theme} plain inset={dividerInset.glyph}>
              <ListRow
                theme={theme}
                icon="phone"
                label="Call"
                value="+234 706 688 4933"
                chevron={false}
                onPress={callSupport}
              />

              <ListRow
                theme={theme}
                icon="whatsapp"
                label="WhatsApp"
                chevron={false}
                onPress={openWhatsAppSupport}
              />

              <ListRow
                theme={theme}
                icon="email-outline"
                label="Email"
                value="support@lasuscholar.com"
                chevron={false}
                onPress={emailSupport}
              />

              <ListRow
                theme={theme}
                icon="email-newsletter"
                label="Info"
                value="info@lasuscholar.com"
                chevron={false}
                onPress={() => Linking.openURL("mailto:info@lasuscholar.com")}
              />
            </ListSection>

            <PrimaryButton
              label="Close"
              onPress={() => setSupportOpen(false)}
              color={theme.accent}
              textColor={theme.onAccent}
              style={styles.supportCloseButton}
            />
          </Card>
        </View>
      </Modal>

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
    </Screen>
  );
}

function PerformanceBar({
  label,
  value,
  color,
  theme,
}: {
  label: string;
  value: number;
  color: string;
  theme: Theme;
}) {
  const safeValue = Math.max(0, Math.min(100, value || 0));

  return (
    <View style={styles.performanceRow}>
      <View style={styles.performanceTop}>
        <Text style={[styles.performanceLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.performanceValue, { color }]}>{safeValue}%</Text>
      </View>

      <View style={[styles.performanceTrack, { backgroundColor: theme.soft }]}>
        <View style={[styles.performanceFill, { width: `${safeValue}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/**
 * One of the four summary numbers, on the page ground.
 *
 * Was a `<Card>` with a tinted icon plate, which made this screen carry four
 * rounded, bordered surfaces for four non-interactive figures. The dashboard
 * already settled this: its `WeekStat` renders the same kind of content as a
 * bare value over a muted label, on the reasoning that four numbers do not
 * need four surfaces and four icon plates. Practice's result screen does the
 * same with `HeadlineStat`. This was the last screen still boxing them.
 *
 * Deliberately mirrors `WeekStat` rather than inventing a third treatment.
 */
function StatBlock({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: Theme;
}) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

// Circles: radius stays `size / 2` arithmetic rather than a radius token,
// per the note in tokens.ts.
const AVATAR = 96;
const CAMERA_BADGE = 34;

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },

  // Extra separation so a destructive action doesn't read as just another group.
  signOut: {
    marginTop: spacing.lg,
  },

  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxxl,
  },

  loadingTitle: {
    ...type.title,
    marginTop: spacing.lg,
  },

  loadingText: {
    ...type.body,
    textAlign: "center",
    marginTop: spacing.sm,
  },

  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
  },

  topTitle: type.section,

  identitySection: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    // Was carried by the deleted avatarRing wrapper.
    marginBottom: spacing.lg,
  },

  avatarText: type.hero,

  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR / 2,
  },

  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: CAMERA_BADGE,
    height: CAMERA_BADGE,
    borderRadius: CAMERA_BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },

  name: {
    ...type.display,
    textAlign: "center",
  },

  email: {
    ...type.body,
    marginTop: spacing.xs,
  },

  rolePill: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  roleText: type.kicker,

  // Mirrors dashboard's weekGrid exactly — same content, same treatment, so
  // the two screens read as one product rather than two takes on a stat row.
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.xl,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },

  statBlock: {
    // Half width rather than flex: wrapping needs a resolved basis, and flex
    // would keep all four on one line.
    width: "50%",
  },

  statValue: type.display,

  statLabel: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },

  progressPanel: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },

  sectionKicker: {
    ...type.kicker,
    marginBottom: spacing.xs,
  },

  sectionTitle: type.title,

  performanceRow: {
    marginBottom: spacing.lg,
  },

  performanceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  performanceLabel: type.bodyStrong,

  performanceValue: type.bodyStrong,

  performanceTrack: {
    height: 9,
    borderRadius: radius.pill,
    overflow: "hidden",
  },

  performanceFill: {
    height: "100%",
    borderRadius: radius.pill,
  },

  progressNote: {
    ...type.body,
    marginTop: spacing.md,
  },

  infoPanel: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },

  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  infoLabel: type.caption,

  infoValue: {
    ...type.bodyLg,
    fontWeight: weight.black,
    marginTop: spacing.xxs,
  },

  actionsPanel: {
    padding: spacing.lg,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderWidth: 0,
  },

  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  actionTitle: {
    ...type.bodyLg,
    fontWeight: weight.black,
  },

  actionSubtitle: {
    ...type.caption,
    fontWeight: weight.regular,
    marginTop: spacing.xs,
  },

  logoutButton: {
    marginTop: spacing.md,
  },

  reviewBox: {
    width: "100%",
    maxWidth: 370,
    padding: spacing.xxl,
  },

  starRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  reviewInput: {
    ...type.body,
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    textAlignVertical: "top",
    marginBottom: spacing.md,
  },

  reviewCancelButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },

  reviewCancelText: type.bodyStrong,

  supportBox: {
    width: "100%",
    maxWidth: 360,
    padding: spacing.xxl,
  },

  supportTitle: {
    ...type.title,
    textAlign: "center",
    marginBottom: spacing.sm,
  },

  supportMessage: {
    ...type.body,
    textAlign: "center",
    marginBottom: spacing.lg,
  },

  supportButton: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },

  supportButtonIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  supportButtonTitle: type.bodyStrong,

  supportButtonValue: {
    ...type.caption,
    fontWeight: weight.semi,
    marginTop: spacing.xxs,
  },

  supportCloseButton: {
    marginTop: spacing.md,
  },

  alertOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
  },

  alertIconWrap: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },

});
