import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import type { IconName } from "./ui/alerts";

/**
 * Premium tier — INTERFACE ONLY.
 *
 * Nothing here talks to a payment SDK. Entitlement is read from AsyncStorage
 * so the UI is demoable, and every integration point is marked
 * TODO(revenuecat) so it can be found with one grep.
 *
 * Deliberately not backed by a Supabase column: there is no shared auth or
 * profile context in this app — each screen calls getUser() and re-fetches
 * `profiles` independently, and study/practice/exam use narrow selects. A real
 * entitlement flag means touching those queries or adding a provider, which
 * belongs with the RevenueCat work rather than with interface scaffolding.
 */

export const PREMIUM_FLAG_KEY = "lasu_scholar_premium";

export type PlanId = "monthly" | "annual";

export type Plan = {
  id: PlanId;
  label: string;
  /** Placeholder. RevenueCat returns localised price strings at runtime. */
  price: string;
  note: string;
  savingPercent?: number;
};

export const PLANS: readonly Plan[] = [
  { id: "monthly", label: "Monthly", price: "₦2,500", note: "per month" },
  {
    id: "annual",
    label: "Annual",
    price: "₦20,000",
    note: "₦1,667 / month",
    savingPercent: 33,
  },
];

export type PremiumFeature = {
  icon: IconName;
  label: string;
  /** Which `category` hue to tint the glyph with. Resolved at the call site. */
  tone: "orange" | "blue" | "green" | "purple" | "yellow" | "teal";
};

/** What Premium actually unlocks. Every one of these exists and works today. */
export const PREMIUM_FEATURES: readonly PremiumFeature[] = [
  {
    icon: "infinity",
    label: "Longer practice and exam sessions",
    tone: "orange",
  },
  {
    icon: "chart-box-outline",
    label: "Full performance breakdown by topic",
    tone: "blue",
  },
  {
    icon: "tray-arrow-down",
    label: "Unlimited PDF summary downloads",
    tone: "green",
  },
  {
    icon: "cards-outline",
    label: "Flashcards that save between sessions",
    tone: "purple",
  },
  {
    icon: "restore",
    label: "Retry wrong, flagged and saved questions",
    tone: "teal",
  },
];

/** Stated plainly, because a paywall listing only what's locked reads badly —
 *  and here the honest answer is that most of the app stays open. */
export const FREE_FEATURES: readonly PremiumFeature[] = [
  {
    icon: "book-open-page-variant-outline",
    label: "Every course, topic and material",
    tone: "blue",
  },
  { icon: "eye-outline", label: "Study mode and the in-app viewer", tone: "green" },
  { icon: "trophy-outline", label: "Goals, streak, XP and leaderboard", tone: "yellow" },
];

/** Not yet built. Kept visually separate so it never reads as part of the
 *  pitch — if these don't ship, delete the group rather than leaving it. */
export const UPCOMING_FEATURES: readonly PremiumFeature[] = [
  { icon: "file-clock-outline", label: "Past questions", tone: "blue" },
  { icon: "compass-outline", label: "AIA Tutorial", tone: "purple" },
];

/**
 * TODO(revenuecat): replace the AsyncStorage read with
 * `Purchases.getCustomerInfo()` and check the entitlement, and subscribe to
 * `addCustomerInfoUpdateListener` so the flag stays live.
 */
export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(PREMIUM_FLAG_KEY)
      .then((value) => {
        if (active) setIsPremium(value === "true");
      })
      .catch(() => {
        if (active) setIsPremium(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { isPremium, loading };
}

/**
 * TODO(revenuecat): replace with `Purchases.purchasePackage(pkg)` and handle
 * the userCancelled / paymentPending / storeProblem cases.
 *
 * Intentionally does NOT grant entitlement — flipping the flag here would let
 * the UI claim a purchase that never happened.
 */
export async function purchasePlan(_planId: PlanId): Promise<{ ok: false; reason: string }> {
  return {
    ok: false,
    reason: "In-app purchases aren't connected yet. This screen is a preview.",
  };
}

/** TODO(revenuecat): replace with `Purchases.restorePurchases()`. */
export async function restorePurchases(): Promise<{ ok: false; reason: string }> {
  return {
    ok: false,
    reason: "There's nothing to restore until purchases are connected.",
  };
}
