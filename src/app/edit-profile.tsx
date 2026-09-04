import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { AlertType, useThemeMode } from "../theme";
import {
  isDuplicateUsernameError,
  isUsernameTaken,
  normalizeUsername,
  useUsernameAvailability,
  usernameFormatError,
} from "../username";
import { AlertModal } from "../ui/AlertModal";
import { PrimaryButton } from "../ui/Button";
import { dividerInset, ListRow, ListSection } from "../ui/List";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { layout, noFocusRing, spacing, type, weight } from "../ui/tokens";

type Profile = {
  id: string;
  username: string | null;
  full_name?: string | null;
  email: string | null;
  school: string | null;
  faculty: string | null;
  department: string | null;
  level: string | null;
  profile_completed?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const SUPPORT_WHATSAPP = "2347066884933";

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

export default function EditProfilePage() {
  const { theme } = useThemeMode();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Excludes your own row, so keeping the handle you already have never
  // reports as taken.
  const { status: usernameStatus, message: usernameMessage } =
    useUsernameAvailability(username, profile?.id);

  // This section is a plain list, not an AuthField, so there is no per-field
  // error slot — the footer carries the read-out instead.
  const usernameFooter =
    usernameStatus === "checking"
      ? "Checking username…"
      : usernameStatus === "available"
        ? "Username is available."
        : usernameMessage || undefined;

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
    primaryText: "OK",
    secondaryText: "",
    onPrimary: null as null | (() => void),
  });

  function showAlert({
    type = "info",
    title,
    message,
    primaryText = "OK",
    secondaryText = "",
    onPrimary = null,
  }: {
    type?: AlertType;
    title: string;
    message: string;
    primaryText?: string;
    secondaryText?: string;
    onPrimary?: null | (() => void);
  }) {
    setAlert({
      visible: true,
      type,
      title,
      message,
      primaryText,
      secondaryText,
      onPrimary,
    });
  }

  function closeAlert() {
    setAlert((prev) => ({
      ...prev,
      visible: false,
      onPrimary: null,
    }));
  }

  function handlePrimary() {
    const action = alert.onPrimary;
    closeAlert();
    if (action) setTimeout(action, 120);
  }

  async function loadProfile() {
    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        showAlert({
          type: "error",
          title: "Profile Error",
          message: error.message,
        });
        return;
      }

      if (!data) {
        router.replace("/complete-profile");
        return;
      }

      const nextProfile = data as Profile;

      setProfile(nextProfile);
      setUsername(clean(nextProfile.username));
      setFullName(clean(nextProfile.full_name));
      setSchool(clean(nextProfile.school));
      setFaculty(clean(nextProfile.faculty));
      setDepartment(clean(nextProfile.department));
      setLevel(clean(nextProfile.level));
    } finally {
      setLoading(false);
    }
  }

  // Declared after loadProfile so the compiler lint can see the binding —
  // hoisting made this work either way, but the rule reads lexical order.
  useEffect(() => {
    loadProfile();
  }, []);

  function validateForm() {
    const formatError = usernameFormatError(username);

    if (formatError) {
      showAlert({
        type: "warning",
        title: "Check Your Username",
        message: formatError,
      });
      return false;
    }

    return true;
  }

  function confirmSave() {
    if (!validateForm()) return;
    saveProfile();
  }

  async function saveProfile() {
    if (!profile) return;

    try {
      setSaving(true);

      const nextUsername = normalizeUsername(username);

      // Re-checked at save time — the debounced lookup can be stale by the
      // time someone actually taps Save.
      if (await isUsernameTaken(nextUsername, profile.id)) {
        showAlert({
          type: "warning",
          title: "Username Taken",
          message: "Someone already has that username. Please pick another one.",
        });
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .update({
          username: nextUsername,
          full_name: clean(fullName),
        })
        .eq("id", profile.id)
        .select("*")
        .maybeSingle();

      if (error) {
        // The unique index settles races the check above cannot. Its rejection
        // is an expected outcome, so it reads as one.
        if (isDuplicateUsernameError(error)) {
          showAlert({
            type: "warning",
            title: "Username Taken",
            message: "Someone just claimed that username. Please pick another one.",
          });
          return;
        }

        showAlert({
          type: "error",
          title: "Update Failed",
          message: error.message,
        });
        return;
      }

      if (data) {
        setProfile(data as Profile);
      }

      showAlert({
        type: "success",
        title: "Profile Updated",
        message: "Your personal profile changes have been saved successfully.",
        primaryText: "Done",
        onPrimary: () => router.back(),
      });
    } finally {
      setSaving(false);
    }
  }

  function openAcademicSupport() {
    const message = [
      "Hello LASU Scholar Admin, I need correction on my academic profile.",
      "",
      `Full name: ${clean(fullName) || "Not provided"}`,
      `Username: ${clean(username) || "Not provided"}`,
      `Email: ${profile?.email || "Not available"}`,
      "",
      "Current details on my app:",
      `School: ${school || "Not set"}`,
      `Faculty: ${faculty || "Not set"}`,
      `Department: ${department || "Not set"}`,
      `Level: ${level || "Not set"}`,
      "",
      "Correct details:",
      "School:",
      "Faculty:",
      "Department:",
      "Level:",
      "",
      "When did you complete your profile?",
      "",
      "What mistake did you make?",
      "",
      "Please review and help me correct it.",
    ].join("\n");

    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;

    Linking.openURL(url).catch(() => {
      showAlert({
        type: "error",
        title: "Could Not Open WhatsApp",
        message: "Please contact admin support manually on WhatsApp.",
      });
    });
  }

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

  const lock = <MaterialCommunityIcons name="lock-outline" size={16} color={theme.muted} />;

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        title="Edit Profile"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
      >
        <ListSection
          theme={theme}
          title="Personal"
          inset={dividerInset.none}
          footer={usernameFooter}
        >
          <ListRow
            theme={theme}
            label="Username"
            accessory={
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Enter username"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                style={[styles.input, noFocusRing, { color: theme.text }]}
              />
            }
          />

          <ListRow
            theme={theme}
            label="Full name"
            accessory={
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter full name"
                placeholderTextColor={theme.muted}
                style={[styles.input, noFocusRing, { color: theme.text }]}
              />
            }
          />

          <ListRow
            theme={theme}
            label="Email"
            value={profile?.email || "No email"}
            chevron={false}
            accessory={lock}
          />
        </ListSection>

        {/* The lock glyphs carry "you can't edit this"; the footer carries the
            one thing they can't — who to ask. Replaces two paragraphs that
            said the same thing 60 lines apart. */}
        <ListSection
          theme={theme}
          title="Academic"
          inset={dividerInset.none}
          footer="Managed by admin support to keep your course access correct."
        >
          <ListRow
            theme={theme}
            label="School"
            value={school || "Not set"}
            chevron={false}
            accessory={lock}
          />

          <ListRow
            theme={theme}
            label="Faculty"
            value={faculty || "Not set"}
            chevron={false}
            accessory={lock}
          />

          <ListRow
            theme={theme}
            label="Department"
            value={department || "Not set"}
            chevron={false}
            accessory={lock}
          />

          <ListRow
            theme={theme}
            label="Level"
            value={level || "Not set"}
            chevron={false}
            accessory={lock}
          />

          <ListRow
            theme={theme}
            label="Request correction"
            value="WhatsApp"
            onPress={openAcademicSupport}
          />
        </ListSection>

        <PrimaryButton
          label={saving ? "Saving" : "Save changes"}
          onPress={confirmSave}
          disabled={saving}
          color={theme.accent}
          textColor={theme.onAccent}
          icon={saving ? <ActivityIndicator size="small" color={theme.onAccent} /> : undefined}
        />
      </PageHeader>

      <AlertModal
        theme={theme}
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        primaryLabel={alert.primaryText}
        onPrimary={handlePrimary}
        secondaryLabel={alert.secondaryText || undefined}
        onSecondary={closeAlert}
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
  input: {
    flex: 1,
    ...type.bodyLg,
    fontWeight: weight.regular,
    textAlign: "right",
    // Android gives TextInput intrinsic vertical padding that would push the
    // row past its 52px floor.
    paddingVertical: 0,
  },
});
