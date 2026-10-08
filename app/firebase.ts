import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, orderBy, query, onSnapshot, setDoc, where, writeBatch } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export type VideoRecord = {
  id: string;
  title: string;
  description: string;
  captions: string;
  hashtags: string[];
  videoUrl: string;
  json2videoUrl?: string;
  shotstackUrl?: string;
  youtubeVideoId?: string;
  facebookVideoId?: string;
  instagramVideoId?: string;
  youtube?: 0 | 1;
  facebook?: 0 | 1;
  instagram?: 0 | 1;
  format: string;
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

function normalizeVideoRecord(video: VideoRecord): VideoRecord {
  if (video.videoUrl || video.youtubeVideoId) return { ...video, status: "completed" };
  return video.status === "failed" ? video : { ...video, status: "completed" };
}

export async function getVideos(userId: string): Promise<VideoRecord[]> {
  if (!database) return [];
  const videoQuery = query(collection(database, "users", userId, "videos"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(videoQuery);
  return snapshot.docs.map((video) => normalizeVideoRecord({ id: video.id, ...video.data() } as VideoRecord));
}

export function listenToVideos(userId: string, callback: (videos: VideoRecord[]) => void) {
  if (!database) return () => {};
  const videoQuery = query(collection(database, "users", userId, "videos"), orderBy("createdAt", "desc"));
  return onSnapshot(videoQuery, (snapshot) => {
    callback(snapshot.docs.map((video) => normalizeVideoRecord({ id: video.id, ...video.data() } as VideoRecord)));
  });
}

export async function saveVideo(userId: string, video: VideoRecord): Promise<void> {
  if (!database) throw new Error("Firestore is not configured");
  const { id, sessionOnly: _sessionOnly, ...record } = video;
  await setDoc(doc(database, "users", userId, "videos", id), record);
}

import { deleteDoc } from "firebase/firestore";

export async function deleteVideo(userId: string, videoId: string): Promise<void> {
  if (!database) throw new Error("Firebase not configured");
  await deleteDoc(doc(database, "users", userId, "videos", videoId));
}

export async function deleteVideosByYouTubeId(userId: string, youtubeVideoId: string): Promise<void> {
  if (!database) throw new Error("Firebase not configured");
  const videosQuery = query(collection(database, "users", userId, "videos"), where("youtubeVideoId", "==", youtubeVideoId));
  const snapshot = await getDocs(videosQuery);
  if (snapshot.empty) return;
  const batch = writeBatch(database);
  snapshot.docs.forEach((video) => batch.delete(video.ref));
  await batch.commit();
}

export async function deleteVideosByFacebookId(userId: string, facebookVideoId: string): Promise<void> {
  if (!database) throw new Error("Firebase not configured");
  const videosQuery = query(collection(database, "users", userId, "videos"), where("facebookVideoId", "==", facebookVideoId));
  const snapshot = await getDocs(videosQuery);
  if (snapshot.empty) return;
  const batch = writeBatch(database);
  snapshot.docs.forEach((video) => batch.delete(video.ref));
  await batch.commit();
}
