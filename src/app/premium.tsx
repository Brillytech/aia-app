import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  FREE_FEATURES,
  Plan,
  PLANS,
  PlanId,
  PREMIUM_FEATURES,
  purchasePlan,
  restorePurchases,
  UPCOMING_FEATURES,
  usePremium,
} from "../premium";
import { AlertType, category, Theme, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import { PrimaryButton } from "../ui/Button";
import { Card } from "../ui/Card";
import { haptics } from "../ui/haptics";
import { IconPlate } from "../ui/IconPlate";
import { ListRow, ListSection } from "../ui/List";
import { PageHeader } from "../ui/PageHeader";
import { PremiumBadge } from "../ui/Premium";
import { Screen } from "../ui/Screen";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";

const PREMIUM_TONE = category.yellow;

export default function PremiumPage() {
  const { theme } = useThemeMode();
  const { isPremium } = usePremium();

  const [selected, setSelected] = useState<PlanId>("annual");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });

  function showAlert(type: AlertType, title: string, message: string) {
    setAlert({ visible: true, type, title, message });
  }

  // TODO(revenuecat): swap for Purchases.purchasePackage(). The stub never
  // grants entitlement — a preview must not claim a purchase that didn't
  // happen.
  async function onUpgrade() {
    setBusy(true);
    const result = await purchasePlan(selected);
    setBusy(false);

    showAlert("info", "Coming soon", result.reason);
  }

  // TODO(revenuecat): swap for Purchases.restorePurchases().
  async function onRestore() {
    const result = await restorePurchases();
    showAlert("info", "Nothing to restore", result.reason);
  }

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        theme={theme}
        title="Premium"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.hero}>
          <IconPlate theme={theme} icon="crown" color={PREMIUM_TONE} size="lg" />

          <Text style={[styles.heroTitle, { color: theme.text }]}>
            {isPremium ? "You're on Premium" : "LASU Scholar Premium"}
          </Text>

          <Text style={[styles.heroNote, { color: theme.muted }]}>
            {isPremium
              ? "Thanks for supporting the app. Everything below is unlocked."
              : "Go deeper on the work you're already doing."}
          </Text>
        </View>

        {!isPremium ? (
          <View style={styles.plans}>
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                theme={theme}
                plan={plan}
                active={selected === plan.id}
                onPress={() => {
                  haptics.select();
                  setSelected(plan.id);
                }}
              />
            ))}
          </View>
        ) : null}

        <ListSection theme={theme} title="What you unlock">
          {PREMIUM_FEATURES.map((feature) => (
            <ListRow
              key={feature.label}
              theme={theme}
              icon={feature.icon}
              iconColor={category[feature.tone]}
              label={feature.label}
              chevron={false}
            />
          ))}
        </ListSection>

        {/* Load-bearing, not filler: a paywall listing only what's locked
            reads as hostile, and here most of the app genuinely stays open. */}
        <ListSection theme={theme} title="Free forever">
          {FREE_FEATURES.map((feature) => (
            <ListRow
              key={feature.label}
              theme={theme}
              icon={feature.icon}
              iconColor={category[feature.tone]}
              label={feature.label}
              chevron={false}
            />
          ))}
        </ListSection>

        {/* Kept separate and pill-marked so it never reads as part of the
            pitch. If these don't ship, delete the group. */}
        <ListSection theme={theme} title="Coming to Premium">
          {UPCOMING_FEATURES.map((feature) => (
            <ListRow
              key={feature.label}
              theme={theme}
              icon={feature.icon}
              iconColor={category[feature.tone]}
              label={feature.label}
              pill={{ label: "Soon", color: theme.muted }}
              chevron={false}
            />
          ))}
        </ListSection>

        {!isPremium ? (
          <>
            <PrimaryButton
              label={busy ? "Checking…" : "Upgrade to Premium"}
              onPress={onUpgrade}
              disabled={busy}
              color={PREMIUM_TONE}
              textColor={theme.onAccent}
              icon={
                <MaterialCommunityIcons name="crown" size={18} color={theme.onAccent} />
              }
            />

            <Pressable onPress={onRestore} style={styles.restore}>
              <Text style={[styles.restoreText, { color: theme.muted }]}>
                Restore purchase
              </Text>
            </Pressable>

            <Text style={[styles.fineprint, { color: theme.muted }]}>
              Cancel anytime. Prices shown are placeholders while in-app
              purchases are being set up.
            </Text>
          </>
        ) : null}
      </PageHeader>

      <AlertModal
        theme={theme}
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        primaryLabel="OK"
        onPrimary={() => setAlert((prev) => ({ ...prev, visible: false }))}
      />
    </Screen>
  );
}

function PlanCard({
  theme,
  plan,
  active,
  onPress,
}: {
  theme: Theme;
  plan: Plan;
  active: boolean;
  onPress: () => void;
}) {
  const dark = theme.mode === "dark";

  return (
    <Card
      onPress={onPress}
      theme={theme}
      tone={active ? PREMIUM_TONE : undefined}
      backgroundColor={theme.card}
      borderColor={theme.border}
      shadowColor={theme.shadow}
      radiusSize="lg"
      elevationLevel={active ? 0 : 1}
      style={styles.planCard}
    >
      <View style={styles.planTop}>
        <Text
          style={[styles.planLabel, { color: active ? PREMIUM_TONE : theme.muted }]}
        >
          {plan.label}
        </Text>

        {plan.savingPercent ? (
          <View
            style={[
              styles.savingPill,
              { backgroundColor: withAlpha(PREMIUM_TONE, dark ? 0.28 : 0.18) },
            ]}
          >
            <Text style={[styles.savingText, { color: PREMIUM_TONE }]}>
              −{plan.savingPercent}%
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.planPrice, { color: theme.text }]}>{plan.price}</Text>
      <Text style={[styles.planNote, { color: theme.muted }]}>{plan.note}</Text>

      <View style={styles.planCheck}>
        <MaterialCommunityIcons
          name={active ? "check-circle" : "circle-outline"}
          size={20}
          color={active ? PREMIUM_TONE : withAlpha(theme.muted, 0.5)}
        />
      </View>
    </Card>
  );
}

/** Re-exported so screens can show status without importing two modules. */
export { PremiumBadge };

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  heroTitle: {
    ...type.title,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  heroNote: {
    ...type.body,
    fontWeight: weight.regular,
    textAlign: "center",
    maxWidth: 300,
  },
  plans: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  planCard: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.xxs,
  },
  planTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  planLabel: {
    ...type.caption,
    fontWeight: weight.bold,
    letterSpacing: 0,
  },
  savingPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  savingText: {
    ...type.micro,
    letterSpacing: 0.2,
  },
  planPrice: {
    ...type.title,
    marginTop: spacing.sm,
  },
  planNote: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  planCheck: {
    marginTop: spacing.md,
  },
  restore: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    minHeight: 44,
  },
  restoreText: {
    ...type.body,
    fontWeight: weight.medium,
  },
  fineprint: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
