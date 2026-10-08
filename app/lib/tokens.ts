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
  let firestoreTokens: Record<string, any> = {};
  if (database) {
    try {
      const tokenRef = doc(database, "app_config", getSecretDocId());
      const snapshot = await getDoc(tokenRef);
      if (snapshot.exists()) {
        firestoreTokens = snapshot.data() as Record<string, any>;
      }
    } catch (error) {
      console.error("Failed to read tokens from Firestore:", error);
    }
  }

  // Also check local tokens.json if present
  let localTokens: Record<string, any> = {};
  try {
    const tokensFile = path.join(process.cwd(), "tokens.json");
    if (fs.existsSync(tokensFile)) {
      localTokens = JSON.parse(fs.readFileSync(tokensFile, "utf8"));
    }
  } catch {}

  const pickFreshest = (t1: any, t2: any) => {
    if (!t1) return t2;
    if (!t2) return t1;
    if (t1.refresh_token && !t2.refresh_token) return { ...t2, ...t1 };
    if (!t1.refresh_token && t2.refresh_token) return { ...t1, ...t2 };
    if ((t1.expiry_date || 0) >= (t2.expiry_date || 0)) return { ...t2, ...t1 };
    return { ...t1, ...t2 };
  };

  return {
    ...localTokens,
    ...firestoreTokens,
    youtube: pickFreshest(firestoreTokens.youtube, localTokens.youtube),
    facebook: { ...localTokens.facebook, ...firestoreTokens.facebook },
    instagram: { ...localTokens.instagram, ...firestoreTokens.instagram },
    gmail: pickFreshest(firestoreTokens.gmail, localTokens.gmail),
  };
}

export async function writeTokens(tokens: Record<string, any>): Promise<void> {
  // 1. Write to Firestore
  if (database) {
    try {
      const tokenRef = doc(database, "app_config", getSecretDocId());
      await setDoc(tokenRef, tokens, { merge: true });
    } catch (error) {
      console.error("Failed to write tokens to Firestore:", error);
    }
  }

  // 2. Write to local tokens.json if writable
  try {
    const tokensFile = path.join(process.cwd(), "tokens.json");
    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));
  } catch {}
}
