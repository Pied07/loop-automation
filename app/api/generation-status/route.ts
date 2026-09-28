import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId || !/^[A-Za-z0-9_-]{10,80}$/.test(eventId)) {
    return NextResponse.json({ error: "Invalid generation event ID." }, { status: 400 });
  }

  const isDevelopment = process.env.NODE_ENV === "development";
  const signingKey = process.env.INNGEST_SIGNING_KEY;
  if (!isDevelopment && !signingKey) {
    return NextResponse.json({ error: "INNGEST_SIGNING_KEY is required to check job status." }, { status: 503 });
  }

  const apiBase = isDevelopment
    ? (process.env.INNGEST_BASE_URL || "http://127.0.0.1:8288")
    : "https://api.inngest.com";
  const headers = new Headers();
  if (signingKey) headers.set("Authorization", `Bearer ${signingKey}`);

  try {
    const response = await fetch(`${apiBase}/v1/events/${encodeURIComponent(eventId)}/runs`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Could not read generation status (${response.status}).` }, { status: 502 });
    }

    const payload = await response.json();
    const run = payload?.data?.[0];
    if (!run) return NextResponse.json({ status: "queued" }, { headers: { "Cache-Control": "no-store" } });

    const status = String(run.status || "").toLowerCase();
    if (status === "completed") {
      let result = run.output;
      if (typeof result === "string") {
        try { result = JSON.parse(result); } catch {}
      }
      return NextResponse.json({ status: "completed", result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (["failed", "cancelled"].includes(status)) {
      return NextResponse.json({ status: "failed", error: run.output?.error || `Generation ${status}.` }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ status: "running" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check the generation status.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
