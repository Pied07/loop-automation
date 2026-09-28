import { completeMetaOAuth } from "@/app/lib/meta-oauth";

export async function GET(request: Request) {
  return completeMetaOAuth(request, "facebook");
}
