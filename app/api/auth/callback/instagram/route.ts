import { completeMetaOAuth } from "@/app/lib/meta-oauth";
import { completeInstagramLogin } from "@/app/lib/instagram-oauth";

export async function GET(request: Request) {
  // Try Meta OAuth first (standard for Instagram Business & Reels publishing)
  try {
    return await completeMetaOAuth(request, "instagram");
  } catch (metaErr) {
    console.warn("Meta OAuth failed for Instagram callback, attempting fallback:", metaErr);
    return completeInstagramLogin(request);
  }
}
