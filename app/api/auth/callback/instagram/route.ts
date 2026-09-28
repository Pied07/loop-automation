import { completeInstagramLogin } from "@/app/lib/instagram-oauth";

export async function GET(request: Request) {
  return completeInstagramLogin(request);
}
