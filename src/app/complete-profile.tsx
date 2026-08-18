import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { Theme, useThemeMode } from "../theme";
import {
  isDuplicateUsernameError,
  isUsernameTaken,
  normalizeUsername,
  useUsernameAvailability,
  usernameFormatError,
} from "../username";
import { AlertModal } from "../ui/AlertModal";
import { AuthField } from "../ui/AuthField";
import { Card } from "../ui/Card";
import { haptics } from "../ui/haptics";
import { UsernameStatusHint } from "../ui/UsernameStatusHint";
import { layout, motion, radius, spacing, type, weight, withAlpha } from "../ui/tokens";


const lasuData: Record<string, string[]> = {
  Arts: [
    "Arabic",
    "Christian Religious Studies",
    "English",
    "French",
    "History and International Studies",
    "Islamic Studies",
    "Linguistics",
    "Music",
    "Peace Studies",
    "Philosophy",
    "Portuguese / English",
    "Theatre Arts",
    "Yoruba",
  ],
  "Communication and Media Studies": ["Mass Communication"],
  Education: [
    "Arabic Education",
    "Biology Education",
    "Business Education",
    "Chemistry Education",
    "Christian Religious Studies Education",
    "Computer Science Education",
    "Early Childhood Education",
    "Economics Education",
    "Educational Management",
    "English Education",
    "French Education",
    "Geography Education",
    "Guidance and Counselling",
    "Health Education",
    "History Education",
    "Islamic Studies Education",
    "Mathematics Education",
    "Music Education",
    "Physical and Health Education",
    "Physics Education",
    "Political Science Education",
    "Social Studies and Civic Education",
    "Special Education",
    "Technology and Vocational Education",
    "Yoruba Education",
  ],
  Engineering: [
    "Aeronautic and Astronautic Engineering",
    "Chemical Engineering",
    "Civil Engineering",
    "Electronics and Computer Engineering",
    "Industrial Engineering",
    "Mechanical Engineering",
  ],
  "Environmental Sciences": [
    "Architecture",
    "Building",
    "Estate Management",
    "Environmental Management",
    "Fine Arts",
    "Industrial Design",
    "Survey and Geo-Informatics",
    "Quantity Surveying",
    "Urban and Regional Planning",
  ],
  Law: ["Common/Civil Law", "Common/Islamic Law"],
  "Management Sciences": [
    "Accounting",
    "Banking and Finance",
    "Business Administration",
    "Industrial Relations and Human Resource Management",
    "Insurance",
    "Local Government Development and Administration",
    "Management Technology",
    "Marketing",
    "Public Administration",
    "Taxation",
  ],
  Science: [
    "Biochemistry",
    "Botany",
    "Chemistry",
    "Fisheries and Aquatic Biology",
    "Mathematics",
    "Microbiology",
    "Physics",
    "Science Laboratory Technology",
    "Zoology",
  ],
  "Social Sciences": [
    "Economics",
    "Geography and Planning",
    "Political Science",
    "Sociology",
    "Psychology",
  ],
  "Computing and Information Technology": [
    "Computer Science",
    "Cyber Security",
    "Data Science",
    "Information and Communication Technology",
    "Software Engineering",
  ],
  "School of Agriculture": [
    "Agricultural Economics",
    "Agricultural Extension and Rural Development",
    "Animal Science",
    "Crop Production",
  ],
  "School of Library, Archival and Information Science": [
    "Library and Information Science",
  ],
  "School of Transport and Logistics": [
    "Transport Management and Operations",
    "Logistics and Supply Chain Management",
  ],
};

const lasucomDepartments = [
  "Dentistry",
  "Medical Laboratory Science",
  "Medicine and Surgery",
  "Nursing",
  "Pharmacy",
  "Pharmacology",
  "Physiology",
  "Physiotherapy",
  "Radiography and Radiation Science",
];

const LASU_LEVELS = [{ label: "100 Level", value: "100L" }];

const LASUCOM_LEVELS = [
  { label: "100 Level", value: "100L" },
  { label: "200 Level", value: "200L" },
];

type AlertType = "success" | "error" | "warning" | "info";

export default function CompleteProfile() {
  const { theme, isDark } = useThemeMode();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [school, setSchool] = useState<"LASU" | "LASUCOM" | "">("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(false);

  // No exclusion id: on this screen the row does not exist yet, so every
  // match anywhere in `profiles` belongs to somebody else.
  const { status: usernameStatus, message: usernameMessage } =
    useUsernameAvailability(username);

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });

  const departments = useMemo(() => {
    if (school === "LASU" && faculty) return lasuData[faculty] || [];
    if (school === "LASUCOM") return lasucomDepartments;
    return [];
  }, [school, faculty]);

  const levels = school === "LASUCOM" ? LASUCOM_LEVELS : LASU_LEVELS;

  useEffect(() => {
    loadUserDetails();
  }, []);

  async function loadUserDetails() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) return;

    const metadataName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "";

    setFullName(String(metadataName));

    const guessedUsername = user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "") || "";
    setUsername(guessedUsername);
  }

  function showAlert(type: AlertType, title: string, message: string) {
    setAlert({ visible: true, type, title, message });
  }

  function closeAlert() {
    setAlert((prev) => ({ ...prev, visible: false }));
  }


  async function handleSave() {
    const cleanFullName = fullName.trim();
    const cleanUsername = normalizeUsername(username);

    if (!cleanFullName || !cleanUsername || !school || !department || !level) {
      showAlert("warning", "Incomplete Profile", "Please complete all required fields.");
      return;
    }

    const formatError = usernameFormatError(cleanUsername);

    if (formatError) {
      setStep(0);
      showAlert("warning", "Check Your Username", formatError);
      return;
    }

    if (school === "LASU" && !faculty) {
      showAlert("warning", "Select Faculty", "Please select your faculty or school.");
      return;
    }

    setLoading(true);

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) {
      setLoading(false);
      showAlert("error", "Session Expired", "Please login again.");
      router.replace("/auth/login");
      return;
    }

    // Re-checked at save time, not just as you type. The debounced lookup can
    // be several seconds stale by the time someone finishes the last step.
    if (await isUsernameTaken(cleanUsername, user.id)) {
      setLoading(false);
      setStep(0);
      showAlert(
        "warning",
        "Username Taken",
        "Someone already has that username. Please pick another one.",
      );
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: cleanFullName,
      username: cleanUsername,
      school,
      faculty: school === "LASU" ? faculty : "College of Medicine",
      department,
      level,
      role: "student",
      profile_completed: true,
    });

    setLoading(false);

    if (error) {
      // The unique index is what actually settles a race between two people
      // claiming a handle at the same moment. Its rejection is a normal
      // outcome here, not a crash, so it gets a normal message.
      if (isDuplicateUsernameError(error)) {
        setStep(0);
        showAlert(
          "warning",
          "Username Taken",
          "Someone just claimed that username. Please pick another one.",
        );
        return;
      }

      showAlert("error", "Profile Error", error.message);
      return;
    }

    router.replace("/dashboard");
  }

  // Which of the three steps is showing. The form state and handleSave are
  // untouched — this only gates what's on screen at once.
  const [step, setStep] = useState(0);

  // Step 0 additionally waits on the handle: you cannot walk past the name
  // step with one that is malformed or already claimed. "checking" blocks too,
  // so a fast tap on Continue cannot outrun the lookup.
  const stepValid =
    step === 0
      ? Boolean(fullName.trim()) && usernameStatus === "available"
      : step === 1
        ? Boolean(school && (school === "LASUCOM" || faculty))
        : Boolean(department && level);

  function goBack() {
    haptics.tap();
    if (step === 0) return;
    setStep((s) => s - 1);
  }

  function goNext() {
    haptics.tap();

    if (!stepValid) {
      showAlert("warning", "Almost there", "Please complete this step to continue.");
      return;
    }

    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }

    handleSave();
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex1}
      >
        <View style={styles.top}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            disabled={step === 0}
            style={{ opacity: step === 0 ? 0 : 1 }}
          >
            <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text} />
          </Pressable>

          <Text style={[styles.stepCount, { color: theme.muted }]}>
            Step {step + 1} of 3
          </Text>
        </View>

        {/* One bar rather than three dots — it reads as "how much is left",
            which is the question a first-run form has to answer. */}
        <View style={[styles.track, { backgroundColor: theme.soft }]}>
          <Animated.View
            style={[
              styles.fill,
              {
                width: `${((step + 1) / 3) * 100}%`,
                backgroundColor: theme.accent,
                transitionProperty: "width",
                transitionDuration: motion.base,
              },
            ]}
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {step === 0 ? (
            <Animated.View key="s0" entering={FadeInDown.duration(motion.base)}>
              <Text style={[styles.title, { color: theme.text }]}>What should we call you?</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>
                This is how you&apos;ll appear on the leaderboard.
              </Text>

              <View style={styles.form}>
                <AuthField
                  theme={theme}
                  label="Full name"
                  icon="account-outline"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  autoCapitalize="words"
                  autoComplete="name"
                />

                <AuthField
                  theme={theme}
                  label="Username"
                  icon="at"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="e.g. brilly"
                  autoComplete="off"
                  error={usernameMessage || undefined}
                  right={<UsernameStatusHint theme={theme} status={usernameStatus} />}
                />
              </View>
            </Animated.View>
          ) : null}

          {step === 1 ? (
            <Animated.View key="s1" entering={FadeInDown.duration(motion.base)}>
              <Text style={[styles.title, { color: theme.text }]}>Where do you study?</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>
                This decides which courses and materials you see.
              </Text>

              <View style={styles.form}>
                <Text style={[styles.label, { color: theme.muted }]}>School</Text>

                <View style={styles.schoolRow}>
                  {(["LASU", "LASUCOM"] as const).map((item) => {
                    const active = school === item;

                    return (
                      <Card
                        key={item}
                        onPress={() => {
                          setSchool(item);
                          setFaculty(item === "LASUCOM" ? "College of Medicine" : "");
                          setDepartment("");
                          setLevel("100L");
                        }}
                        theme={theme}
                        tone={active ? theme.accent : undefined}
                        backgroundColor={theme.card}
                        borderColor={theme.border}
                        shadowColor={theme.shadow}
                        radiusSize="lg"
                        elevationLevel={active ? 0 : 1}
                        style={styles.schoolCard}
                      >
                        <MaterialCommunityIcons
                          name={item === "LASUCOM" ? "stethoscope" : "school-outline"}
                          size={24}
                          color={active ? theme.accent : theme.muted}
                        />
                        <Text
                          style={[
                            styles.schoolName,
                            { color: active ? theme.accent : theme.text },
                          ]}
                        >
                          {item}
                        </Text>
                        <Text style={[styles.schoolSub, { color: theme.muted }]}>
                          {item === "LASU" ? "100 Level" : "100L and 200L"}
                        </Text>
                      </Card>
                    );
                  })}
                </View>

                {school === "LASU" ? (
                  <>
                    <Text style={[styles.label, { color: theme.muted }]}>Faculty</Text>
                    <View style={styles.chips}>
                      {Object.keys(lasuData).map((item) => (
                        <OptionChip
                          key={item}
                          theme={theme}
                          label={item}
                          active={faculty === item}
                          onPress={() => {
                            setFaculty(item);
                            setDepartment("");
                          }}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </Animated.View>
          ) : null}

          {step === 2 ? (
            <Animated.View key="s2" entering={FadeInDown.duration(motion.base)}>
              <Text style={[styles.title, { color: theme.text }]}>Your department and level</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>
                You can ask support to change these later.
              </Text>

              <View style={styles.form}>
                <Text style={[styles.label, { color: theme.muted }]}>Department</Text>
                <View style={styles.chips}>
                  {departments.map((item) => (
                    <OptionChip
                      key={item}
                      theme={theme}
                      label={item}
                      active={department === item}
                      onPress={() => setDepartment(item)}
                    />
                  ))}
                </View>

                <Text style={[styles.label, { color: theme.muted }]}>Level</Text>
                <View style={styles.chips}>
                  {levels.map((item) => (
                    <OptionChip
                      key={item.value}
                      theme={theme}
                      label={item.label}
                      active={level === item.value}
                      onPress={() => setLevel(item.value)}
                    />
                  ))}
                </View>
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            onPress={goNext}
            activeOpacity={0.9}
            disabled={loading}
            style={[
              styles.primary,
              {
                backgroundColor: stepValid ? theme.accent : theme.soft,
                opacity: loading ? 0.7 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <>
                <Text
                  style={[
                    styles.primaryText,
                    { color: stepValid ? theme.onAccent : theme.muted },
                  ]}
                >
                  {step === 2 ? "Finish setup" : "Continue"}
                </Text>
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={20}
                  color={stepValid ? theme.onAccent : theme.muted}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
}

function OptionChip({
  theme,
  label,
  active,
  onPress,
}: {
  theme: Theme;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const dark = theme.mode === "dark";

  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[
        styles.chip,
        {
          backgroundColor: active
            ? withAlpha(theme.accent, dark ? 0.24 : 0.16)
            : theme.card,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? theme.accent : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex1: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.md,
  },
  stepCount: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
  },
  track: {
    height: 3,
    marginHorizontal: layout.screenGutter,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill },
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
  },
  title: { ...type.display },
  subtitle: {
    ...type.body,
    fontWeight: weight.regular,
    marginTop: spacing.sm,
  },
  form: { marginTop: spacing.xxxl },
  label: {
    ...type.caption,
    fontWeight: weight.medium,
    letterSpacing: 0,
    marginBottom: spacing.sm,
  },
  schoolRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  schoolCard: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  schoolName: { ...type.bodyLg, fontWeight: weight.bold },
  schoolSub: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: "center",
  },
  chipText: { ...type.body, fontWeight: weight.medium },
  footer: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    minHeight: 56,
  },
  primaryText: { ...type.bodyLg, fontWeight: weight.bold },
});
