import { database } from "@/app/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";

// Secure unguessable document ID derived from a server-side secret
const getSecretDocId = () => {
  const secret = process.env.GOOGLE_CLIENT_SECRET || process.env.META_APP_SECRET || "fallback_local_secret";
  return `secure_tokens_${secret.substring(0, 16)}`;
};

export async function readTokens(): Promise<Record<string, any>> {
  let localTokens: Record<string, any> = {};
  try {
    const tokensFile = path.join(process.cwd(), "tokens.json");
    if (fs.existsSync(tokensFile)) {
      localTokens = JSON.parse(fs.readFileSync(tokensFile, "utf8")) || {};
    }
  } catch {}

  let firestoreTokens: Record<string, any> | null = null;
  if (database) {
    try {
      const tokenRef = doc(database, "app_config", getSecretDocId());
      const snapshot = await getDoc(tokenRef);
      if (snapshot.exists()) {
        firestoreTokens = (snapshot.data() as Record<string, any>) || {};
      }
    } catch (error) {
      console.error("Failed to read tokens from Firestore:", error);
    }
  }

  // Merge Firestore and local tokens so valid credentials (like YouTube OAuth) are never lost
  const merged: Record<string, any> = { ...localTokens, ...(firestoreTokens || {}) };
  // If Firestore is missing a platform that exists in localTokens, restore it
  for (const [k, v] of Object.entries(localTokens)) {
    if (!merged[k] || (typeof merged[k] === "object" && Object.keys(merged[k]).length === 0)) {
      merged[k] = v;
    }
  }

  // If Firestore exists and was missing keys from localTokens, backfill Firestore
  if (database && firestoreTokens !== null && Object.keys(localTokens).length > 0) {
    const missingKeys = Object.keys(localTokens).filter((k) => !firestoreTokens?.[k]);
    if (missingKeys.length > 0) {
      try {
        const tokenRef = doc(database, "app_config", getSecretDocId());
        await setDoc(tokenRef, merged, { merge: true });
      } catch {}
    }
  }

  return merged;
}

export async function writeTokens(tokens: Record<string, any>): Promise<void> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (v !== undefined && v !== null) {
      if (typeof v === "object" && Object.keys(v).length === 0) continue;
      cleaned[k] = v;
    }
  }

  // 1. Write to Firestore WITHOUT merge: true so deleted platforms are genuinely purged
  if (database) {
    try {
      const tokenRef = doc(database, "app_config", getSecretDocId());
      await setDoc(tokenRef, cleaned, { merge: false });
    } catch (error) {
      console.error("Failed to write tokens to Firestore:", error);
    }
  }

  // 2. Write to local tokens.json if writable
  try {
    const tokensFile = path.join(process.cwd(), "tokens.json");
    fs.writeFileSync(tokensFile, JSON.stringify(cleaned, null, 2));
  } catch {}
}
