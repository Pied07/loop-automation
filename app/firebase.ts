import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, query, onSnapshot, setDoc, where, writeBatch, deleteDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export type VideoRecord = {
  id: string;
  userId?: string;
  title: string;
  description: string;
  captions?: string;
  hashtags: string[];
  thumbnailUrl?: string;
  videoUrl?: string;
  sourceUrl?: string;
  sourceLink?: string;
  isCron?: boolean;
  cloudinaryUrl?: string;
  cloudinaryPublicId?: string;
  youtube?: 0 | 1;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  facebook?: 0 | 1;
  facebookVideoId?: string;
  facebookUrl?: string;
  facebookStoryId?: string;
  facebookPostId?: string;
  instagram?: 0 | 1;
  instagramVideoId?: string;
  instagramUrl?: string;
  instagramStoryId?: string;
  format?: string;
  createdAt: string;
  status?: "completed" | "failed";
  sessionOnly?: boolean;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const app = firebaseConfigured
  ? getApps().length ? getApp() : initializeApp(firebaseConfig)
  : null;
export const auth = app ? getAuth(app) : null;
export const database = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

export function normalizeVideoRecord(video: any): VideoRecord {
  const yt: 0 | 1 = video.youtube === 1 ? 1 : (video.youtube === 0 ? 0 : (Boolean(video.youtubeVideoId || video.youtubeUrl) ? 1 : 0));
  const fb: 0 | 1 = video.facebook === 1 ? 1 : (video.facebook === 0 ? 0 : (Boolean(video.facebookVideoId || video.facebookUrl) ? 1 : 0));
  const ig: 0 | 1 = video.instagram === 1 ? 1 : (video.instagram === 0 ? 0 : (Boolean(video.instagramVideoId || video.instagramUrl) ? 1 : 0));

  const ytUrl = yt === 1 ? (video.youtubeUrl || (video.youtubeVideoId ? `https://www.youtube.com/shorts/${video.youtubeVideoId}` : "")) : "";
  const fbUrl = fb === 1 ? (video.facebookUrl || (video.facebookVideoId ? `https://www.facebook.com/reel/${video.facebookVideoId}` : "")) : "";
  const igUrl = ig === 1 ? (video.instagramUrl || (video.instagramVideoId ? (video.instagramVideoId.startsWith("http") ? video.instagramVideoId : `https://www.instagram.com/reel/${video.instagramVideoId}`) : "")) : "";
  const src = video.sourceUrl || video.sourceLink || video.originalUrl || "";

  return {
    ...video,
    id: String(video.id || ""),
    userId: String(video.userId || ""),
    title: video.title || "Untitled Clip",
    description: video.description || "",
    captions: video.captions || "",
    hashtags: Array.isArray(video.hashtags) ? video.hashtags : [],
    thumbnailUrl: video.thumbnailUrl || "",
    videoUrl: video.videoUrl || "",
    sourceUrl: src,
    sourceLink: src,
    isCron: Boolean(video.isCron || video.userId === "auto-pilot" || String(video.id || "").startsWith("cron-") || String(video.jobId || "").startsWith("cron-")),
    cloudinaryUrl: video.cloudinaryUrl || "",
    cloudinaryPublicId: video.cloudinaryPublicId || "",
    youtube: yt,
    youtubeVideoId: yt === 1 ? (video.youtubeVideoId || "") : "",
    youtubeUrl: ytUrl,
    facebook: fb,
    facebookVideoId: fb === 1 ? (video.facebookVideoId || "") : "",
    facebookUrl: fbUrl,
    instagram: ig,
    instagramVideoId: ig === 1 ? (video.instagramVideoId || "") : "",
    instagramUrl: igUrl,
    format: video.format || "Trending",
    createdAt: video.createdAt || new Date().toISOString(),
    status: video.status || "completed",
  };
}

export async function getVideos(userId: string): Promise<VideoRecord[]> {
  if (!database) return [];
  const map = new Map<string, VideoRecord>();

  try {
    const subSnap = await getDocs(collection(database, "users", userId, "videos"));
    subSnap.docs.forEach((doc) => {
      const v = normalizeVideoRecord({ id: doc.id, ...doc.data() });
      if (v.id) map.set(v.id, v);
    });
  } catch (err) {
    console.warn("Subcollection getVideos notice:", err);
  }

  try {
    const userIds = [userId, "auto-pilot", "creator"];
    const q = query(collection(database, "videos"), where("userId", "in", userIds));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((doc) => {
      const v = normalizeVideoRecord({ id: doc.id, ...doc.data() });
      if (v.id) map.set(v.id, v);
    });
  } catch (err) {
    console.warn("Top-level getVideos notice:", err);
  }

  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export function listenToVideos(userId: string, callback: (videos: VideoRecord[]) => void) {
  if (!database) return () => {};

  const userIds = [userId, "auto-pilot", "creator"];
  let topDocs: VideoRecord[] = [];
  let subDocs: VideoRecord[] = [];

  const emitCombined = () => {
    const map = new Map<string, VideoRecord>();
    for (const v of subDocs) {
      if (v.id) map.set(v.id, v);
    }
    for (const v of topDocs) {
      if (v.id) map.set(v.id, v);
    }
    const combined = Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
    callback(combined);
  };

  const qTop = query(collection(database, "videos"), where("userId", "in", userIds));
  const unsubTop = onSnapshot(
    qTop,
    (snapshot) => {
      topDocs = snapshot.docs.map((doc) => normalizeVideoRecord({ id: doc.id, ...doc.data() }));
      emitCombined();
    },
    (error) => {
      console.warn("Firestore top-level listen notice:", error);
    }
  );

  let unsubSub = () => {};
  try {
    const qSub = collection(database, "users", userId, "videos");
    unsubSub = onSnapshot(
      qSub,
      (snapshot) => {
        subDocs = snapshot.docs.map((doc) => normalizeVideoRecord({ id: doc.id, ...doc.data() }));
        emitCombined();
      },
      (error) => {
        console.warn("Firestore user subcollection listen notice:", error);
      }
    );
  } catch {}

  return () => {
    unsubTop();
    unsubSub();
  };
}

export async function saveVideo(userId: string, video: Partial<VideoRecord> & { id: string }): Promise<void> {
  if (!database) throw new Error("Firestore is not configured");
  const { id, sessionOnly: _sessionOnly, ...record } = video;
  const youtubeVal: 0 | 1 = record.youtube === 1 ? 1 : 0;
  const facebookVal: 0 | 1 = record.facebook === 1 ? 1 : 0;
  const instagramVal: 0 | 1 = record.instagram === 1 ? 1 : 0;
  const cleanRecord = {
    ...record,
    id,
    userId,
    youtube: youtubeVal,
    facebook: facebookVal,
    instagram: instagramVal,
    youtubeUrl: youtubeVal === 1 ? (record.youtubeUrl || (record.youtubeVideoId ? `https://www.youtube.com/shorts/${record.youtubeVideoId}` : "")) : "",
    facebookUrl: facebookVal === 1 ? (record.facebookUrl || (record.facebookVideoId ? `https://www.facebook.com/reel/${record.facebookVideoId}` : "")) : "",
    instagramUrl: instagramVal === 1 ? (record.instagramUrl || (record.instagramVideoId ? (record.instagramVideoId.startsWith("http") ? record.instagramVideoId : `https://www.instagram.com/reel/${record.instagramVideoId}`) : "")) : "",
  };

  try {
    await setDoc(doc(database, "videos", id), cleanRecord, { merge: true });
  } catch (err: any) {
    console.warn("Failed to write to top-level 'videos' collection (rules not deployed yet):", err.message);
    try {
      await setDoc(doc(database, "users", userId, "videos", id), cleanRecord, { merge: true });
    } catch (subErr) {
      console.warn("Subcollection save also failed:", subErr);
    }
    throw err;
  }
}

export async function deleteVideo(userId: string, videoId: string): Promise<void> {
  if (!database) throw new Error("Firebase not configured");
  try {
    await deleteDoc(doc(database, "videos", videoId));
  } catch {}
  try {
    await deleteDoc(doc(database, "users", userId, "videos", videoId));
  } catch {}
}

export async function clearAllUserVideos(userId: string): Promise<void> {
  if (!database) return;
  try {
    const q = query(collection(database, "videos"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const batch = writeBatch(database);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch {}
  try {
    const subSnap = await getDocs(collection(database, "users", userId, "videos"));
    const batch2 = writeBatch(database);
    subSnap.docs.forEach((d) => batch2.delete(d.ref));
    await batch2.commit();
  } catch {}
}

export async function deleteVideosByYouTubeId(userId: string, youtubeVideoId: string): Promise<void> {
  if (!database) throw new Error("Firebase not configured");
  const videosQuery = query(collection(database, "videos"), where("userId", "==", userId), where("youtubeVideoId", "==", youtubeVideoId));
  const snapshot = await getDocs(videosQuery);
  if (snapshot.empty) return;
  const batch = writeBatch(database);
  snapshot.docs.forEach((video) => batch.delete(video.ref));
  await batch.commit();
}

export async function deleteVideosByFacebookId(userId: string, facebookVideoId: string): Promise<void> {
  if (!database) throw new Error("Firebase not configured");
  const videosQuery = query(collection(database, "videos"), where("userId", "==", userId), where("facebookVideoId", "==", facebookVideoId));
  const snapshot = await getDocs(videosQuery);
  if (snapshot.empty) return;
  const batch = writeBatch(database);
  snapshot.docs.forEach((video) => batch.delete(video.ref));
  await batch.commit();
}
