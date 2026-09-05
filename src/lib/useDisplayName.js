import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

export async function saveDisplayName(userId, rawName) {
  const trimmedName = (rawName || "").trim();

  if (!trimmedName) {
    return { displayName: null, error: "Please enter a display name." };
  }

  if (trimmedName.length < MIN_LENGTH || trimmedName.length > MAX_LENGTH) {
    return {
      displayName: null,
      error: `Display name must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters.`,
    };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, display_name: trimmedName });

  if (error) {
    if (error.code === "23505") {
      return {
        displayName: null,
        error: "This display name is already taken. Please choose another.",
      };
    }

    console.error("Error saving display name:", error);
    return {
      displayName: null,
      error: "Something went wrong. Please try again.",
    };
  }

  return { displayName: trimmedName, error: null };
}

export function useDisplayName() {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [existingDisplayName, setExistingDisplayName] = useState(null);
  const [displayNameInput, setDisplayNameInput] = useState("");

  useEffect(() => {
    const loadUserAndProfile = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.error("Error getting user:", error);
        setLoading(false);
        return;
      }

      setUserId(user?.id ?? null);

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Error loading profile:", profileError);
      } else {
        setExistingDisplayName(profile?.display_name || null);
      }

      setLoading(false);
    };

    loadUserAndProfile();
  }, []);

  const ensureDisplayName = async () => {
    if (existingDisplayName) {
      return { displayName: existingDisplayName, error: null };
    }

    const result = await saveDisplayName(userId, displayNameInput);

    if (result.error) {
      return { displayName: null, error: result.error };
    }

    setExistingDisplayName(result.displayName);
    return { displayName: result.displayName, error: null };
  };

  return {
    userId,
    loading,
    existingDisplayName,
    displayNameInput,
    setDisplayNameInput,
    ensureDisplayName,
  };
}
