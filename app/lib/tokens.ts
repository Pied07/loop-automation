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
  let firestoreTokens: Record<string, any> | null = null;
  if (database) {
    try {
      const tokenRef = doc(database, "app_config", getSecretDocId());
      const snapshot = await getDoc(tokenRef);
      if (snapshot.exists()) {
        firestoreTokens = (snapshot.data() as Record<string, any>) || {};
      } else {
        firestoreTokens = {};
      }
    } catch (error) {
      console.error("Failed to read tokens from Firestore:", error);
    }
  }

  // If Firestore tokens exist, Firestore is the single authoritative store
  if (firestoreTokens !== null) {
    return firestoreTokens;
  }

  // Fallback to local tokens.json ONLY if Firestore is unavailable
  try {
    const tokensFile = path.join(process.cwd(), "tokens.json");
    if (fs.existsSync(tokensFile)) {
      return JSON.parse(fs.readFileSync(tokensFile, "utf8"));
    }
  } catch {}

  return {};
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
