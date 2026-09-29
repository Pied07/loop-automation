import { database } from "@/app/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Secure unguessable document ID derived from a server-side secret
const getSecretDocId = () => {
  const secret = process.env.GOOGLE_CLIENT_SECRET || process.env.META_APP_SECRET || "fallback_local_secret";
  return `secure_tokens_${secret.substring(0, 16)}`;
};

export async function readTokens(): Promise<Record<string, any>> {
  if (!database) {
    console.warn("Firestore not configured, falling back to empty tokens");
    return {};
  }
  
  try {
    const tokenRef = doc(database, "app_config", getSecretDocId());
    const snapshot = await getDoc(tokenRef);
    
    if (snapshot.exists()) {
      return snapshot.data() as Record<string, any>;
    }
  } catch (error) {
    console.error("Failed to read tokens from Firestore:", error);
  }
  
  return {};
}

export async function writeTokens(tokens: Record<string, any>): Promise<void> {
  if (!database) {
    console.error("Firestore not configured, cannot save tokens");
    return;
  }
  
  try {
    const tokenRef = doc(database, "app_config", getSecretDocId());
    await setDoc(tokenRef, tokens, { merge: true });
  } catch (error) {
    console.error("Failed to write tokens to Firestore:", error);
    throw new Error("Failed to save tokens securely. Check Firestore rules and configuration.");
  }
}
