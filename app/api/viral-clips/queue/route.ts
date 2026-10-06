import { NextRequest, NextResponse } from "next/server";
import { database } from "@/app/firebase";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";

export const dynamic = "force-dynamic";

interface QueueJob {
  jobId: string;
  videoUrl: string;
  contentCategory: string;
  status: "pending" | "processing" | "done" | "failed";
  worker?: string;
  createdAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __viralJobQueue: Map<string, QueueJob> | undefined;
}

const memQueue = globalThis.__viralJobQueue || new Map<string, QueueJob>();
globalThis.__viralJobQueue = memQueue;

// GET: Worker polls this endpoint for pending jobs
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const claimJobId = searchParams.get("claim");

  // Claim a specific job
  if (claimJobId) {
    if (database) {
      try {
        const jobRef = doc(database, "jobs", claimJobId);
        const snap = await getDoc(jobRef);
        if (snap.exists()) {
          await updateDoc(jobRef, { status: "processing", worker: "desktop-worker", claimedAt: Date.now() });
          return NextResponse.json({ success: true, job: { jobId: claimJobId, ...snap.data(), status: "processing" } });
        }
      } catch (err: any) {
        console.warn("Firestore claim job notice:", err.message);
      }
    }

    const memJob = memQueue.get(claimJobId);
    if (memJob) {
      memJob.status = "processing";
      memJob.worker = "desktop-worker";
      memQueue.set(claimJobId, memJob);
      return NextResponse.json({ success: true, job: memJob });
    }
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Find oldest pending job in Firestore
  if (database) {
    try {
      const q = query(collection(database, "jobs"), where("status", "==", "pending"), orderBy("createdAt", "asc"), limit(1));
      const snaps = await getDocs(q);
      if (!snaps.empty) {
        const docSnap = snaps.docs[0];
        return NextResponse.json({ job: { jobId: docSnap.id, ...docSnap.data() } });
      }
    } catch (err: any) {
      console.warn("Firestore queue query notice:", err.message);
    }
  }

  // Fallback to in-memory queue
  for (const [id, job] of memQueue.entries()) {
    if (job.status === "pending" && Date.now() - job.createdAt < 15 * 60 * 1000) {
      return NextResponse.json({ job });
    }
  }

  return NextResponse.json({ job: null });
}

// POST: Add a new job or update existing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, videoUrl, contentCategory, status, action } = body;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (action === "claim") {
      if (database) {
        try {
          const jobRef = doc(database, "jobs", jobId);
          await updateDoc(jobRef, { status: "processing", worker: "desktop-worker", claimedAt: Date.now() });
          const snap = await getDoc(jobRef);
          return NextResponse.json({ success: true, job: { jobId, ...snap.data() } });
        } catch {}
      }

      const memJob = memQueue.get(jobId);
      if (memJob) {
        memJob.status = "processing";
        memQueue.set(jobId, memJob);
        return NextResponse.json({ success: true, job: memJob });
      }
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (action === "complete" || action === "remove") {
      if (database) {
        try {
          const jobRef = doc(database, "jobs", jobId);
          await updateDoc(jobRef, { status: "done", completedAt: Date.now() });
        } catch {}
      }
      memQueue.delete(jobId);
      return NextResponse.json({ success: true });
    }

    // Add or update
    const job: QueueJob = {
      jobId,
      videoUrl: videoUrl || "",
      contentCategory: contentCategory || "Trending",
      status: status || "pending",
      createdAt: Date.now(),
    };

    if (database) {
      try {
        await setDoc(doc(database, "jobs", jobId), job, { merge: true });
      } catch (err: any) {
        console.warn("Failed to write queue job to Firestore:", err.message);
      }
    }

    memQueue.set(jobId, job);

    // Auto-cleanup jobs older than 1 hour in memory
    const now = Date.now();
    for (const [id, j] of memQueue.entries()) {
      if (now - j.createdAt > 3600000) {
        memQueue.delete(id);
      }
    }

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
