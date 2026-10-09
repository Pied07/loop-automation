"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  BarChart3,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Download,
  Film,
  Flame,
  Flower2,
  FolderOpen,
  Lightbulb,
  Link,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Mountain,
  Music2,
  Play,
  Plus,
  Scissors,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  WandSparkles,
  X,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { auth, firebaseConfigured, database, listenToVideos, saveVideo, deleteVideo, clearAllUserVideos, normalizeVideoRecord, type VideoRecord } from "./firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { deleteFromYouTube, deleteFromFacebook, deleteFromInstagram } from "./actions";
import { FaYoutube, FaInstagram, FaFacebookF } from "react-icons/fa6";
import { SiGmail } from "react-icons/si";

type ClipMeta = {
  clipPath: string;
  publicUrl: string;
  partNumber: number;
  title: string;
  description: string;
  hashtags: string[];
  duration: number;
  startTime: number;
  cloudinaryPublicId?: string;
};

type PublishStatus = "idle" | "publishing" | "done" | "error";

type ClipPublishResult = {
  status: PublishStatus;
  youtubeUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  logs: string[];
  error?: string;
};

const formats = [
  { name: "Trending", icon: TrendingUp, tone: "mint", detail: "Viral & trending now" },
  { name: "Comedy", icon: AudioLines, tone: "yellow", detail: "Funny & entertaining" },
  { name: "Motivational", icon: Sparkles, tone: "mint", detail: "Inspiring moments" },
  { name: "Horror", icon: Flame, tone: "coral", detail: "Spooky & thrilling" },
  { name: "Educational", icon: Lightbulb, tone: "blue", detail: "Learn something new" },
  { name: "Romance", icon: Flower2, tone: "pink", detail: "Love & emotion" },
  { name: "Adventure", icon: Mountain, tone: "sky", detail: "Action & outdoors" },
  { name: "Music", icon: Music2, tone: "lilac", detail: "Music & performance" },
  { name: "Food", icon: WandSparkles, tone: "gold", detail: "Food & cooking" },
];

type Screen = "home" | "studio" | "library" | "settings";

function isGarbageRecord(video: VideoRecord): boolean {
  if (!video) return true;
  const title = (video.title || "").trim();
  const desc = (video.description || "").trim();
  // Filter click-to-watch / tap-to-watch teasers or feed post shares
  if (/tap to watch/i.test(title) || /tap to watch/i.test(desc)) return true;
  // Filter posts where title starts with a URL or contains reel links
  if (/^https?:\/\//i.test(title)) return true;
  if (/facebook\.com\/reel\//i.test(title) || /instagram\.com\/reel\//i.test(title)) return true;
  // Filter empty titles or hashtags-only titles
  if (!title || /^#+/.test(title)) return true;
  return false;
}

function getRecordTimestamp(video: VideoRecord): number {
  if (!video) return 0;
  if (video.createdAt) {
    if (/^\d{10,13}$/.test(String(video.createdAt))) {
      const num = Number(video.createdAt);
      return num < 1e11 ? num * 1000 : num;
    }
    const parsed = Date.parse(video.createdAt);
    if (!isNaN(parsed) && parsed > 0) {
      if (String(video.createdAt).trim().length <= 10) {
        const idMatch = video.id?.match(/\b(\d{13})\b/);
        if (idMatch) {
          const idTs = Number(idMatch[1]);
          if (idTs > 1600000000000 && idTs < 2500000000000) {
            return idTs;
          }
        }
      }
      return parsed;
    }
  }
  const idMatch = video.id?.match(/\b(\d{13})\b/);
  if (idMatch) {
    const idTs = Number(idMatch[1]);
    if (idTs > 1600000000000 && idTs < 2500000000000) {
      return idTs;
    }
  }
  return 0;
}

function extractYouTubeId(str?: string): string {
  if (!str) return "";
  const match = str.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|live\/)([^#&?]{11})/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  return "";
}

function extractFacebookId(str?: string): string {
  if (!str) return "";
  const match = str.match(/(?:facebook\.com\/(?:reel\/|watch\/\?v=|.*\/videos\/))(\d+)/);
  if (match && match[1]) return match[1];
  if (/^\d{10,24}$/.test(str)) return str;
  return "";
}

function extractInstagramId(str?: string): string {
  if (!str) return "";
  const match = str.match(/(?:instagram\.com\/(?:reel|p)\/)([^/?#&]+)/);
  if (match && match[1]) return match[1];
  if (str.startsWith("ig-")) return str.slice(3);
  return "";
}

function extractCloudinaryId(url?: string): string {
  if (!url) return "";
  const match = url.match(/\/upload\/(?:[a-zA-Z0-9_,-]+\/)?(?:v\d+\/)?([^\.#?]+)/);
  return match && match[1] ? match[1] : "";
}

function normalizeVideoUrl(url?: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function cleanTitle(title?: string): string {
  if (!title) return "";
  return title
    .replace(/^(trending|horror|historical|motivational|sci-fi|mystery|philosophy|adventure|romance|anime|asmr|music|food|comedy|educational)\s*:\s*/i, "")
    .trim();
}

function normalizeTitle(title?: string): string {
  const cleaned = cleanTitle(title);
  return cleaned.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractBaseTitle(title?: string): string {
  if (!title) return "";
  const cleaned = cleanTitle(title);
  const firstPart = cleaned.split(/[—–\-\|:\"“”]/)[0].trim();
  return normalizeTitle(firstPart);
}

function normalizeDescription(desc?: string): string {
  if (!desc) return "";
  return desc.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
}

function getHashtagsSignature(hashtags?: string[]): string {
  if (!hashtags || hashtags.length < 3) return "";
  const cleaned = hashtags
    .map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((h) => h.length >= 3)
    .sort();
  if (cleaned.length < 3) return "";
  return cleaned.join(",");
}

function extractPartNumber(title?: string): number | null {
  if (!title) return null;
  const match = title.match(/\b(?:part|pt|episode|ep)\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function areConflictingParts(titleA?: string, titleB?: string): boolean {
  const partA = extractPartNumber(titleA);
  const partB = extractPartNumber(titleB);
  if (partA !== null && partB !== null && partA !== partB) {
    return true;
  }
  return false;
}

function getTitleQualityScore(t?: string): number {
  if (!t) return 0;
  let score = 100;
  if (/[a-zA-Z0-9]\s*["']?\s*$/.test(t) && t.length >= 65 && t.length <= 75) {
    score -= 30;
  }
  if (/\b(?:going t|the c|watch m|see t)\s*$/i.test(t)) {
    score -= 50;
  }
  if (t.includes("—") || t.includes("–")) {
    const parts = t.split(/[—–]/);
    if (parts.length >= 2 && normalizeTitle(parts[0]) && normalizeTitle(parts[1]).includes(normalizeTitle(parts[0]))) {
      score -= 40;
    }
  }
  return score;
}

function areSameVideo(a: VideoRecord, b: VideoRecord): boolean {
  if (!a || !b) return false;

  // Never merge different parts of a multi-part series
  if (areConflictingParts(a.title, b.title)) {
    return false;
  }

  // 1. Direct ID match
  const cleanIdA = a.id?.startsWith("session-") ? a.id.slice(8) : a.id;
  const cleanIdB = b.id?.startsWith("session-") ? b.id.slice(8) : b.id;
  if (cleanIdA && cleanIdB && cleanIdA === cleanIdB) return true;

  // 2. YouTube ID match
  const ytA = a.youtubeVideoId || extractYouTubeId(a.videoUrl);
  const ytB = b.youtubeVideoId || extractYouTubeId(b.videoUrl);
  if (ytA && ytB && ytA === ytB) return true;

  // 3. Facebook ID match
  const fbA = a.facebookVideoId || extractFacebookId(a.videoUrl) || (a.id?.startsWith("fb-") ? a.id.slice(3) : "");
  const fbB = b.facebookVideoId || extractFacebookId(b.videoUrl) || (b.id?.startsWith("fb-") ? b.id.slice(3) : "");
  if (fbA && fbB && fbA === fbB) return true;

  // 4. Instagram ID match
  const igA = a.instagramVideoId || extractInstagramId(a.videoUrl) || (a.id?.startsWith("ig-") ? a.id.slice(3) : "");
  const igB = b.instagramVideoId || extractInstagramId(b.videoUrl) || (b.id?.startsWith("ig-") ? b.id.slice(3) : "");
  if (igA && igB && igA === igB) return true;

  // 5. Cloudinary public ID match
  const cIdA = extractCloudinaryId(a.videoUrl) || extractCloudinaryId(a.thumbnailUrl);
  const cIdB = extractCloudinaryId(b.videoUrl) || extractCloudinaryId(b.thumbnailUrl);
  if (cIdA && cIdB && cIdA === cIdB) return true;

  // 6. Direct video URL match (non-social URLs)
  const urlA = normalizeVideoUrl(a.videoUrl);
  const urlB = normalizeVideoUrl(b.videoUrl);
  if (urlA && urlB && urlA === urlB && !urlA.includes("youtube.com") && !urlA.includes("facebook.com") && !urlA.includes("instagram.com")) {
    return true;
  }

  // 7. Exact normalized title match
  const normTitleA = normalizeTitle(a.title);
  const normTitleB = normalizeTitle(b.title);
  if (normTitleA && normTitleB && normTitleA.length >= 6 && normTitleA === normTitleB) {
    return true;
  }

  // 8. Base title match (e.g. "I'm going to see the car — ✨ ..." vs "I'm going to see the car")
  const baseTitleA = extractBaseTitle(a.title);
  const baseTitleB = extractBaseTitle(b.title);
  if (baseTitleA && baseTitleB && baseTitleA.length >= 6 && baseTitleA === baseTitleB) {
    return true;
  }

  // 9. Title prefix match
  if (normTitleA && normTitleB && Math.min(normTitleA.length, normTitleB.length) >= 8) {
    if (normTitleA.startsWith(normTitleB) || normTitleB.startsWith(normTitleA)) {
      return true;
    }
  }

  // 10. Description match
  const descA = normalizeDescription(a.description);
  const descB = normalizeDescription(b.description);
  if (descA && descB && descA.length >= 15 && descA === descB) {
    return true;
  }

  // 11. Hashtags match
  const tagsA = getHashtagsSignature(a.hashtags);
  const tagsB = getHashtagsSignature(b.hashtags);
  if (tagsA && tagsB && tagsA.length >= 20 && tagsA === tagsB) {
    if (baseTitleA && baseTitleB && (baseTitleA.includes(baseTitleB.slice(0, 5)) || baseTitleB.includes(baseTitleA.slice(0, 5)))) {
      return true;
    }
  }

  return false;
}

class DisjointSet {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(i: number, j: number) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  }
}

function deduplicateVideos(
  groups: (VideoRecord | VideoRecord[] | undefined | null)[],
  userId?: string
): VideoRecord[] {
  const rawList: VideoRecord[] = [];
  for (const item of groups) {
    if (!item) continue;
    if (Array.isArray(item)) {
      for (const v of item) {
        if (v && v.id && !isGarbageRecord(v)) rawList.push(v);
      }
    } else if (item.id && !isGarbageRecord(item)) {
      rawList.push(item);
    }
  }

  if (rawList.length <= 1) {
    return rawList;
  }

  const dsu = new DisjointSet(rawList.length);

  // Compare every pair to connect duplicate records across platforms
  for (let i = 0; i < rawList.length; i++) {
    for (let j = i + 1; j < rawList.length; j++) {
      if (areSameVideo(rawList[i], rawList[j])) {
        dsu.union(i, j);
      }
    }
  }

  const groupMap = new Map<number, VideoRecord[]>();
  for (let i = 0; i < rawList.length; i++) {
    const root = dsu.find(i);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(rawList[i]);
  }

  const result: VideoRecord[] = [];

  for (const records of groupMap.values()) {
    if (records.length === 1) {
      const single = records[0];
      const ytId = single.youtubeVideoId || extractYouTubeId(single.videoUrl);
      const fbId = single.facebookVideoId || extractFacebookId(single.videoUrl);
      const igId = single.instagramVideoId || extractInstagramId(single.videoUrl);
      result.push({
        ...single,
        youtube: (ytId || single.youtube === 1) ? 1 : 0,
        facebook: (fbId || single.facebook === 1) ? 1 : 0,
        instagram: (igId || single.instagram === 1) ? 1 : 0,
        youtubeVideoId: ytId || single.youtubeVideoId || "",
        facebookVideoId: fbId || single.facebookVideoId || "",
        instagramVideoId: igId || single.instagramVideoId || "",
      });
      continue;
    }

    const score = (item: VideoRecord) =>
      (item.videoUrl && item.videoUrl.includes("res.cloudinary.com") ? 500 : 0) +
      (item.thumbnailUrl && !item.thumbnailUrl.includes("/api/viral-clips/thumbnail?") ? 200 : 0) +
      (item.captions?.length || 0) +
      (item.title?.length || 0) +
      (item.hashtags?.length || 0) * 5 +
      ((item.youtube || 0) * 10) +
      ((item.facebook || 0) * 10) +
      ((item.instagram || 0) * 10) +
      (getRecordTimestamp(item) > 0 ? 50 : 0);

    records.sort((a, b) => score(b) - score(a));
    const winner = records[0];

    const allHashtags = new Set<string>();
    for (const r of records) {
      (r.hashtags || []).forEach((h) => allHashtags.add(h));
    }

    const bestTitle = records.slice().sort((a, b) => getTitleQualityScore(b.title) - getTitleQualityScore(a.title))[0]?.title || winner.title;
    const bestDesc = records.slice().sort((a, b) => (b.description?.length || 0) - (a.description?.length || 0))[0]?.description || winner.description;
    const bestYtId = records.map((r) => r.youtubeVideoId || extractYouTubeId(r.videoUrl)).find(Boolean) || "";
    const bestFbId = records.map((r) => r.facebookVideoId || extractFacebookId(r.videoUrl)).find(Boolean) || "";
    const bestFbStoryId = records.find((r) => r.facebookStoryId)?.facebookStoryId || winner.facebookStoryId || "";
    const bestFbPostId = records.find((r) => r.facebookPostId)?.facebookPostId || winner.facebookPostId || "";
    const bestIgId = records.map((r) => r.instagramVideoId || extractInstagramId(r.videoUrl)).find(Boolean) || "";
    const bestIgStoryId = records.find((r) => r.instagramStoryId)?.instagramStoryId || winner.instagramStoryId || "";
    const bestVideoUrl = records.find((r) => r.videoUrl && r.videoUrl.includes("res.cloudinary.com"))?.videoUrl ||
      records.find((r) => r.videoUrl && r.videoUrl.startsWith("http"))?.videoUrl || winner.videoUrl;
    const bestThumb = records.find((r) => r.thumbnailUrl && !r.thumbnailUrl.includes("/api/viral-clips/thumbnail?"))?.thumbnailUrl || winner.thumbnailUrl;

    const isYt: 0 | 1 = (Boolean(bestYtId) || records.some((r) => r.youtube === 1)) ? 1 : 0;
    const isFb: 0 | 1 = (Boolean(bestFbId) || records.some((r) => r.facebook === 1)) ? 1 : 0;
    const isIg: 0 | 1 = (Boolean(bestIgId) || records.some((r) => r.instagram === 1)) ? 1 : 0;

    let bestCreatedAt = winner.createdAt;
    let maxTs = getRecordTimestamp(winner);
    for (const r of records) {
      const ts = getRecordTimestamp(r);
      if (ts > maxTs) {
        maxTs = ts;
        bestCreatedAt = r.createdAt;
      }
    }

    const mergedRecord: VideoRecord = {
      ...winner,
      id: winner.id,
      title: bestTitle,
      description: bestDesc,
      hashtags: Array.from(allHashtags),
      videoUrl: bestVideoUrl,
      thumbnailUrl: bestThumb,
      youtube: isYt,
      facebook: isFb,
      instagram: isIg,
      youtubeVideoId: bestYtId,
      facebookVideoId: bestFbId,
      facebookStoryId: bestFbStoryId,
      facebookPostId: bestFbPostId,
      instagramVideoId: bestIgId,
      instagramStoryId: bestIgStoryId,
      createdAt: bestCreatedAt,
      status: records.some((r) => r.status === "completed") ? "completed" : winner.status,
    };

    result.push(mergedRecord);

    if (userId && database) {
      for (const r of records) {
        if (r.id !== mergedRecord.id) {
          deleteVideo(userId, r.id).catch(() => {});
        }
      }
      saveVideo(userId, mergedRecord).catch(() => {});
    }
  }

  return result.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
}

function mergeVideoRecords(...groups: (VideoRecord[] | VideoRecord)[][]): VideoRecord[] {
  return deduplicateVideos(groups.flat());
}

function StyleImageCard({ s, isSelected, onClick }: { s: any, isSelected: boolean, onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div onClick={onClick} style={{ cursor: 'pointer', borderRadius: '10px', overflow: 'hidden', border: isSelected ? '2.5px solid #e50914' : '1.5px solid #232635', boxShadow: isSelected ? '0 0 0 3px rgba(229,9,20,0.25)' : 'none', transition: 'all 0.2s', background: '#151722' }}>
      <div style={{ position: 'relative', height: '90px', overflow: 'hidden', background: errored ? s.fallback : '#1a1d2a' }}>
        {!errored && (
          <img
            src={s.img} alt={s.label}
            onLoad={() => setLoaded(true)}
            onError={() => { setErrored(true); setLoaded(true); }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.3s' }}
          />
        )}
        {!loaded && !errored && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
        )}
        {isSelected && (
          <div style={{ position: 'absolute', top: 5, right: 5, background: '#e50914', borderRadius: '50%', width: 18, height: 18, boxShadow: '0 0 8px rgba(229,9,20,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        )}
      </div>
      <div style={{ padding: '6px 8px', background: isSelected ? 'rgba(229,9,20,0.12)' : '#111218' }}>
        <div style={{ fontWeight: 700, fontSize: '12px', color: isSelected ? '#ff3b45' : '#f8fafc' }}>{s.label}</div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{s.desc}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("Creator");
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Trending");
  const [videoUrl, setVideoUrl] = useState("");
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [clipResults, setClipResults] = useState<Record<number, ClipPublishResult>>({});
  const [sourceTitle, setSourceTitle] = useState("");
  const [isFinding, setIsFinding] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitStep, setSplitStep] = useState("");
  const [splitProgress, setSplitProgress] = useState(0);
  const [isPublishingAll, setIsPublishingAll] = useState(false);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [filter, setFilter] = useState("All videos");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [connections, setConnections] = useState<string[]>([]);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);
  const [platformTab, setPlatformTab] = useState("All");
  const [videoToDelete, setVideoToDelete] = useState<VideoRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processMode, setProcessMode] = useState<"cloud" | "queue">("cloud");
  const [autoFindSource, setAutoFindSource] = useState<"scrape" | "direct" | "youtube">("scrape");
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storedAuto = localStorage.getItem("tvd-auto-pilot") === "true";
        setAutoPilotEnabled(storedAuto);
        if (database) {
          getDoc(doc(database, "app_config", "auto_pilot"))
            .then((snap) => {
              if (snap.exists() && typeof snap.data()?.enabled === "boolean") {
                setAutoPilotEnabled(snap.data().enabled);
                localStorage.setItem("tvd-auto-pilot", String(snap.data().enabled));
              }
            })
            .catch(() => {});
        }
      } catch {}

      try {
        const stored = localStorage.getItem("tvd-studio-session-videos");
        if (stored) {
          const cachedVideos = JSON.parse(stored);
          if (Array.isArray(cachedVideos) && cachedVideos.length > 0) {
            const valid = cachedVideos.filter((video: VideoRecord) => !isGarbageRecord(video));
            const deduplicated = deduplicateVideos(valid);
            window.setTimeout(() => setVideos(deduplicated), 0);
          }
        }
      } catch {}
      const stored = localStorage.getItem("app_connections");
      const existingConns: string[] = stored ? JSON.parse(stored) : [];

      const searchParams = new URLSearchParams(window.location.search);
      const connectedParam = searchParams.get("connected");
      const connectionError = searchParams.get("error");

      if (connectedParam) {
        const platformMap: Record<string, string> = {
          youtube: "YouTube",
          instagram: "Instagram",
          facebook: "Facebook",
          gmail: "Gmail"
        };
        const newlyConnected = connectedParam.split(",").map((name) => platformMap[name.toLowerCase()] || name);
        notify(`Connected: ${newlyConnected.join(" and ")}.`);
        if (searchParams.get("warning") === "meta_no_instagram") notify("Facebook Page connected. Link a Professional Instagram account to that Page to enable Instagram publishing.");
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => setScreen("settings"), 0);
      } else if (connectionError) {
        const errorMessages: Record<string, string> = {
          oauth_rejected: "Access was declined. Reconnect and approve the requested permissions.",
          missing_credentials: "Facebook App ID or Meta App Secret is missing from the server environment.",
          meta_permissions_missing: "Meta did not grant Page access. Reconnect and approve pages_show_list and pages_manage_posts.",
          meta_no_pages: "No Facebook Page found. Automated Reels require a Facebook Page. Create a free Page at facebook.com/pages/create, link Instagram to it, and reconnect.",
          meta_page_access_missing: "Meta listed a Page but did not grant its access token. Reconnect and approve Page permissions.",
          meta_no_instagram: "No linked Instagram Professional account was found. Convert Instagram to Business/Creator and link it to the Facebook Page, then reconnect.",
          token_exchange_failed: "Meta could not complete the connection. Check the app redirect URI and try reconnecting.",
          no_code: "Meta returned without an authorization code. Try connecting again.",
          instagram_credentials_missing: "Configure the Instagram Login App ID and its App Secret. META_APP_SECRET can be reused only when the Instagram and Facebook App IDs are the same.",
          instagram_oauth_state_invalid: "Instagram sign-in expired or could not be verified. Start the connection again.",
          instagram_token_exchange_failed: "Instagram could not exchange the sign-in code. Verify the Instagram App credentials and exact callback URL.",
          instagram_profile_unavailable: "Instagram login succeeded, but Meta did not return a professional account. Check the Instagram account type and app permissions."
        };
        notify(errorMessages[connectionError] || `Meta connection failed (${connectionError}).`);
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => setScreen("settings"), 0);
      } else if (existingConns.length > 0) {
        setConnections(existingConns);
      }

      // Always synchronize with server-side connected OAuth platforms (keeps all devices in 100% sync)
      fetch("/api/auth/status")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.connections)) {
            setConnections(data.connections);
            localStorage.setItem("app_connections", JSON.stringify(data.connections));
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    let unsubVideos: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (unsubVideos) unsubVideos();
        return;
      }
      setDisplayName(user.displayName || user.email?.split("@")[0] || "Creator");
      setSignedIn(true);
      setScreen("studio");
      if (database) {
        setDoc(doc(database, "app_config", "auto_pilot"), { ownerUserId: user.uid }, { merge: true }).catch(() => {});
      }
      // Synchronize in real-time with videos collection for this user
      try {
        const stored = localStorage.getItem("tvd-studio-session-videos");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setVideos(parsed.map(normalizeVideoRecord));
          }
        }
      } catch {}
      unsubVideos = listenToVideos(user.uid, (firestoreVideos) => {
        if (firestoreVideos && firestoreVideos.length > 0) {
          setVideos(firestoreVideos.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a)));
          try {
            localStorage.setItem("tvd-studio-session-videos", JSON.stringify(firestoreVideos));
          } catch {}
        }
      });
    });
    return () => {
      unsubscribeAuth();
      if (unsubVideos) unsubVideos();
    };
  }, []);

  

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function openAuth(mode: "login" | "signup" = "signup") {
    setAuthMode(mode);
    setAuthError("");
    setShowAuth(true);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      if (auth) {
        const result = authMode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
        setDisplayName(result.user.displayName || email.split("@")[0] || "Creator");
      } else {
        setDisplayName(email.split("@")[0] || "Creator");
        setSignedIn(true);
        setScreen("studio");
        setShowAuth(false);
        notify("Preview mode: connect Firebase to save your work between sessions.");
      }
    } catch {
      setAuthError("That didnâ€™t work. Check your email and password, then try again.");
    } finally {
      setLoading(false);
    }
  }

  function enterPreview() {
    setDisplayName("Studio guest");
    setSignedIn(true);
    setShowAuth(false);
    setScreen("studio");
    notify("Youâ€™re exploring in preview mode. Your work wonâ€™t be saved yet.");
  }

  async function handleSignOut() {
    if (auth && firebaseConfigured) await signOut(auth);
    setSignedIn(false);
    setScreen("home");
    setVideos([]);
  }

  async function handleAutoFind() {
    setIsFinding(true);
    try {
      const response = await fetch("/api/viral-clips/auto-find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory, mode: autoFindSource }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        notify(data.error || "Failed to find video.");
      } else if (data.url) {
        setVideoUrl(data.url);
        if (data.title) setSourceTitle(data.title);
        notify(`🔥 Scraped viral video online: "${data.title || 'Ready to split'}" (${data.source || 'Direct Cloud MP4'})`);
      }
    } catch (err: any) {
      notify("Failed to find video: " + err.message);
    } finally {
      setIsFinding(false);
    }
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      notify("Video file must be under 100MB for free cloud processing.");
      return;
    }
    setIsUploading(true);
    setUploadProgress(15);
    try {
      notify("Requesting direct upload slot...");
      const sigRes = await fetch("/api/viral-clips/upload-sign", { method: "POST" });
      const sigData = await sigRes.json();
      if (!sigRes.ok || !sigData.success) {
        throw new Error(sigData.error || "Failed to initiate video upload");
      }

      setUploadProgress(40);
      notify("Uploading video to cloud storage (bypasses all YouTube bot checks)...");
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sigData.apiKey);
      form.append("timestamp", sigData.timestamp);
      form.append("public_id", sigData.publicId);
      form.append("signature", sigData.signature);

      const upRes = await fetch(sigData.uploadUrl, {
        method: "POST",
        body: form,
      });
      const upData = await upRes.json();
      if (!upRes.ok || !upData.secure_url) {
        throw new Error(upData.error?.message || "Video upload failed");
      }

      setUploadProgress(100);
      setVideoUrl(upData.secure_url);
      notify("Video uploaded! Splitting into clips now...");
      setTimeout(() => {
        handleSplitVideo(upData.secure_url);
      }, 400);
    } catch (err: any) {
      notify("Upload error: " + err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function syncJobClips(receivedClips: any[], sourceTitle?: string) {
    setClips(receivedClips);
    if (sourceTitle) setSourceTitle(sourceTitle);
    const autoPublishedRecords: VideoRecord[] = receivedClips
      .filter((c: any) => c.youtubeVideoId || c.facebookVideoId || c.instagramVideoId)
      .map((c: any) => {
        const stableId = c.cloudinaryPublicId
          ? `clip-${c.cloudinaryPublicId}`
          : (c.youtubeVideoId ? `yt-${c.youtubeVideoId}` : (c.facebookVideoId ? `fb-${c.facebookVideoId}` : `clip-${c.partNumber}-${Date.now()}`));
        return {
          id: stableId,
          title: c.title,
          description: c.description,
          captions: "",
          hashtags: (c.hashtags || []).map((h: string) => `#${h}`),
          videoUrl: c.publicUrl || c.url || "",
          youtubeVideoId: c.youtubeVideoId || "",
          facebookVideoId: c.facebookVideoId || "",
          facebookStoryId: c.facebookStoryId || "",
          facebookPostId: c.facebookPostId || "",
          instagramVideoId: c.instagramVideoId || "",
          instagramStoryId: c.instagramStoryId || "",
          youtube: (c.youtubeVideoId || c.youtubeUrl) ? 1 : 0,
          facebook: (c.facebookVideoId || c.facebookUrl) ? 1 : 0,
          instagram: (c.instagramVideoId || c.instagramUrl) ? 1 : 0,
          thumbnailUrl:
            (c.youtubeVideoId ? `https://i.ytimg.com/vi/${c.youtubeVideoId}/hqdefault.jpg` : undefined) ||
            (c.facebookVideoId ? `/api/viral-clips/thumbnail?facebookId=${c.facebookVideoId}` : undefined),
          format: selectedCategory,
          createdAt: new Date().toISOString(),
          status: "completed",
          sessionOnly: true,
        };
      });
    if (autoPublishedRecords.length > 0) {
      setVideos((prev) => deduplicateVideos([autoPublishedRecords, prev]));
      const cached = JSON.parse(localStorage.getItem("tvd-studio-session-videos") || "[]") as VideoRecord[];
      localStorage.setItem("tvd-studio-session-videos", JSON.stringify(deduplicateVideos([autoPublishedRecords, cached])));
      const currentUser = auth?.currentUser;
      if (currentUser) {
        autoPublishedRecords.forEach((r) => saveVideo(currentUser.uid, r).catch(() => {}));
      }
    }
    const preloadedResults: Record<number, ClipPublishResult> = {};
    for (const c of receivedClips) {
      if (c.youtubeVideoId || c.facebookVideoId || c.instagramVideoId) {
        preloadedResults[c.partNumber] = {
          status: "done",
          youtubeUrl: c.youtubeUrl || (c.youtubeVideoId ? `https://www.youtube.com/shorts/${c.youtubeVideoId}` : undefined),
          facebookUrl: c.facebookUrl || (c.facebookVideoId ? `https://www.facebook.com/reel/${c.facebookVideoId}` : undefined),
          instagramUrl: c.instagramUrl || (c.instagramVideoId ? `https://www.instagram.com/reel/${c.instagramVideoId}` : undefined),
          logs: ["✅ Published via pipeline"],
        };
      }
    }
    if (Object.keys(preloadedResults).length > 0) {
      setClipResults((prev) => ({ ...preloadedResults, ...prev }));
    }
  }

  async function handleSplitVideo(overrideUrl?: string) {
    const targetUrl = typeof overrideUrl === "string" ? overrideUrl.trim() : videoUrl.trim();
    if (!targetUrl) {
      notify("Paste a video URL or upload an MP4 file first.");
      return;
    }
    setIsSplitting(true);
    setSplitStep("Downloading video stream...");
    setSplitProgress(12);
    setClips([]);
    setClipResults({});

    // Advance smoothly across realistic processing stages
    const progressInterval = setInterval(() => {
      setSplitProgress((prev) => {
        if (prev < 32) {
          setSplitStep("Downloading video stream...");
          return Math.min(32, prev + 3);
        } else if (prev < 58) {
          setSplitStep("Analyzing audio and detecting viral moments...");
          return Math.min(58, prev + 2);
        } else if (prev < 82) {
          setSplitStep("Cropping to 9:16 vertical and splitting clips...");
          return Math.min(82, prev + 1.2);
        } else if (prev < 94) {
          setSplitStep("Generating AI titles and viral hashtags...");
          return Math.min(94, prev + 0.6);
        }
        return prev;
      });
    }, 700);

    try {
      const res = await fetch("/api/viral-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: targetUrl,
          contentCategory: selectedCategory,
          mode: processMode,
          sourceTitle: sourceTitle || undefined,
        }),
      });
      clearInterval(progressInterval);
      const responseText = await res.text();
      let data: { success?: boolean; error?: string; jobId?: string; clips?: ClipMeta[]; sourceTitle?: string } = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { error: responseText.slice(0, 180) || "The server returned an invalid response." };
      }
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to process video.");

      if (data.jobId) {
        setSplitStep(processMode === "queue" ? "Job queued for desktop worker..." : "Processing started in cloud runner...");
        setSplitProgress(18);

        let finished = false;

        // 1. HTTP polling to /api/viral-clips/status
        const pollInterval = setInterval(async () => {
          if (finished) return;
          try {
            const sRes = await fetch(`/api/viral-clips/status?jobId=${data.jobId}`);
            if (sRes.ok) {
              const job = await sRes.json();
              if (job.progress && !finished) setSplitProgress(job.progress);
              if (job.step && !finished) setSplitStep(job.step);
              if (job.sourceTitle && !finished) setSourceTitle(job.sourceTitle);

              if (job.status === "done" && Array.isArray(job.clips) && !finished) {
                finished = true;
                clearInterval(pollInterval);
                setSplitProgress(100);
                setSplitStep(`✅ ${job.clips.length} clips ready!`);
                syncJobClips(job.clips, job.sourceTitle);
                setIsSplitting(false);
                notify(`Split complete: ${job.clips.length} clips ready! Review and publish below.`);
              } else if (job.status === "failed" && !finished) {
                finished = true;
                clearInterval(pollInterval);
                setIsSplitting(false);
                setSplitProgress(0);
                setSplitStep("");
                notify(job.error || "Video processing failed.");
              }
            }
          } catch {}
        }, 2500);

        // 2. Real-time Firestore job updates
        if (database) {
          try {
            const unsub = onSnapshot(doc(database, "jobs", data.jobId), (snap) => {
              if (!snap.exists() || finished) return;
              const job = snap.data();
              if (job.progress && !finished) setSplitProgress(job.progress);
              if (job.step && !finished) setSplitStep(job.step);
              if (job.sourceTitle && !finished) setSourceTitle(job.sourceTitle);

              if (job.status === "done" && Array.isArray(job.clips) && !finished) {
                finished = true;
                clearInterval(pollInterval);
                unsub();
                setSplitProgress(100);
                setSplitStep(`✅ ${job.clips.length} clips ready!`);
                syncJobClips(job.clips, job.sourceTitle);
                setIsSplitting(false);
                notify(`Split complete: ${job.clips.length} clips ready! Review and publish below.`);
              } else if (job.status === "failed" && !finished) {
                finished = true;
                clearInterval(pollInterval);
                unsub();
                setIsSplitting(false);
                setSplitProgress(0);
                setSplitStep("");
                notify(job.error || "Video processing failed.");
              }
            });
          } catch {}
        }
        return;
      }

      const receivedClips = Array.isArray(data.clips) ? data.clips : [];
      setSplitProgress(100);
      setSplitStep(`✅ ${receivedClips.length} clips ready!`);
      syncJobClips(receivedClips, data.sourceTitle);
      notify(`Split into ${receivedClips.length} clips! Review and publish below.`);
      setIsSplitting(false);
    } catch (err: any) {
      clearInterval(progressInterval);
      notify(err.message || "Failed to process video.");
      setSplitStep("");
      setSplitProgress(0);
      setIsSplitting(false);
    } finally {
      clearInterval(progressInterval);
    }
  }

  async function handlePublishClip(clip: ClipMeta) {
    const activePlatforms = connections.filter((c) => ["YouTube", "Facebook", "Instagram"].includes(c));
    if (!activePlatforms.length) {
      notify("Connect at least one platform in Settings before publishing.");
      return;
    }
    setClipResults((prev) => ({ ...prev, [clip.partNumber]: { status: "publishing", logs: [] } }));
    try {
      const res = await fetch("/api/viral-clips/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipPath: clip.clipPath,
          partNumber: clip.partNumber,
          totalParts: clips.length,
          title: clip.title,
          description: clip.description,
          hashtags: clip.hashtags,
          platforms: activePlatforms,
          userEmail: auth?.currentUser?.email || "",
          connections,
          cloudinaryPublicId: clip.cloudinaryPublicId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Publish failed.");
      setClipResults((prev) => ({
        ...prev,
        [clip.partNumber]: {
          status: "done",
          youtubeUrl: data.youtubeUrl,
          facebookUrl: data.facebookUrl,
          instagramUrl: data.instagramUrl,
          logs: data.logs || [],
        },
      }));
      const youtubeVal: 0 | 1 = (data.youtubeUrl || data.youtubeVideoId) ? 1 : 0;
      const facebookVal: 0 | 1 = (data.facebookUrl || data.facebookVideoId) ? 1 : 0;
      const instagramVal: 0 | 1 = (data.instagramUrl || data.instagramVideoId) ? 1 : 0;

      // Add or update in video library
      const existingRecord = videos.find((v) => {
        if (clip.cloudinaryPublicId && v.videoUrl && v.videoUrl.includes(clip.cloudinaryPublicId)) return true;
        if (clip.publicUrl && v.videoUrl === clip.publicUrl) return true;
        if (data.youtubeVideoId && (v.youtubeVideoId === data.youtubeVideoId || (v.videoUrl && v.videoUrl.includes(data.youtubeVideoId)))) return true;
        if (data.facebookVideoId && (v.facebookVideoId === data.facebookVideoId || (v.videoUrl && v.videoUrl.includes(data.facebookVideoId)))) return true;
        if (normalizeTitle(v.title) === normalizeTitle(clip.title) && normalizeTitle(clip.title).length >= 4) return true;
        return false;
      });

      const recordId = existingRecord?.id || (clip.cloudinaryPublicId ? `clip-${clip.cloudinaryPublicId}` : (data.youtubeVideoId ? `yt-${data.youtubeVideoId}` : (data.facebookVideoId ? `fb-${data.facebookVideoId}` : `clip-${clip.partNumber}-${Date.now()}`)));

      const newRecord: VideoRecord = {
        ...(existingRecord || {}),
        id: recordId,
        title: clip.title,
        description: clip.description,
        captions: "",
        hashtags: Array.from(new Set([...(clip.hashtags || []).map((h) => `#${h}`), ...(existingRecord?.hashtags || [])])),
        videoUrl: (clip.publicUrl && clip.publicUrl.startsWith("http")) ? clip.publicUrl : (existingRecord?.videoUrl || data.youtubeUrl || data.facebookUrl || data.instagramUrl || ""),
        cloudinaryUrl: clip.publicUrl || existingRecord?.cloudinaryUrl || "",
        cloudinaryPublicId: clip.cloudinaryPublicId || existingRecord?.cloudinaryPublicId || "",
        youtubeVideoId: data.youtubeVideoId || existingRecord?.youtubeVideoId || "",
        youtubeUrl: data.youtubeUrl || (data.youtubeVideoId ? `https://www.youtube.com/shorts/${data.youtubeVideoId}` : existingRecord?.youtubeUrl || ""),
        facebookVideoId: data.facebookVideoId || existingRecord?.facebookVideoId || "",
        facebookUrl: data.facebookUrl || (data.facebookVideoId ? `https://www.facebook.com/reel/${data.facebookVideoId}` : existingRecord?.facebookUrl || ""),
        facebookStoryId: data.facebookStoryId || existingRecord?.facebookStoryId || "",
        facebookPostId: data.facebookPostId || existingRecord?.facebookPostId || "",
        instagramVideoId: data.instagramVideoId || existingRecord?.instagramVideoId || "",
        instagramUrl: data.instagramUrl || (data.instagramVideoId ? `https://www.instagram.com/reel/${data.instagramVideoId}` : existingRecord?.instagramUrl || ""),
        instagramStoryId: data.instagramStoryId || existingRecord?.instagramStoryId || "",
        youtube: (youtubeVal === 1 || Boolean(existingRecord?.youtubeVideoId) || Boolean(existingRecord?.youtubeUrl)) ? 1 : 0,
        facebook: (facebookVal === 1 || Boolean(existingRecord?.facebookVideoId) || Boolean(existingRecord?.facebookUrl)) ? 1 : 0,
        instagram: (instagramVal === 1 || Boolean(existingRecord?.instagramVideoId) || Boolean(existingRecord?.instagramUrl)) ? 1 : 0,
        thumbnailUrl:
          (data.youtubeVideoId ? `https://i.ytimg.com/vi/${data.youtubeVideoId}/hqdefault.jpg` : undefined) ||
          (data.facebookVideoId ? `/api/viral-clips/thumbnail?facebookId=${data.facebookVideoId}` : undefined) ||
          (data.thumbnailUrl && !data.thumbnailUrl.includes("story") ? data.thumbnailUrl : undefined) ||
          existingRecord?.thumbnailUrl,
        format: selectedCategory,
        createdAt: existingRecord?.createdAt || new Date().toISOString(),
        status: "completed",
        sessionOnly: false,
      };
      const currentUser = auth?.currentUser;
      // Immediately update local state and localStorage so the card appears in Library immediately
      setVideos((prev) => [newRecord, ...prev.filter((v) => v.id !== newRecord.id)]);
      try {
        const stored = JSON.parse(localStorage.getItem("tvd-studio-session-videos") || "[]");
        localStorage.setItem("tvd-studio-session-videos", JSON.stringify([newRecord, ...stored.filter((v: any) => v.id !== newRecord.id)]));
      } catch {}

      if (currentUser) {
        saveVideo(currentUser.uid, newRecord).catch((err: any) => {
          console.warn("Firestore saveVideo notice:", err.message);
        });
      }
      notify(`${clip.title} published successfully!`);
    } catch (err: any) {
      setClipResults((prev) => ({ ...prev, [clip.partNumber]: { status: "error", error: err.message, logs: [] } }));
      notify(`Failed to publish ${clip.title}: ${err.message}`);
    }
  }

  async function handlePublishAllClips() {
    setIsPublishingAll(true);
    for (const clip of clips) {
      const existing = clipResults[clip.partNumber];
      if (existing?.status === "done") continue;
      await handlePublishClip(clip);
    }
    setIsPublishingAll(false);
    notify("All clips published! Check your library for links.");
    setScreen("library");
  }

  async function handleClearLibrary() {
    if (!window.confirm("Are you sure you want to clear your video library? This will wipe the library clean so you can start fresh.")) return;
    const currentUser = auth?.currentUser;
    if (!currentUser) return;
    try {
      await clearAllUserVideos(currentUser.uid);
      setVideos([]);
      notify("Video library cleared cleanly.");
    } catch (e: any) {
      notify("Failed to clear library: " + e.message);
    }
  }

  function exportCsv() {
    if (!videos.length) {
      notify("Your library is empty. Generated videos will appear here.");
      return;
    }
    const headers = ["Title", "Description", "Captions", "Hashtags", "Video URL", "Format", "Created"];
    const rows = videos.map((video) => [video.title, video.description, video.captions, video.hashtags.join(" "), video.videoUrl, video.format, video.createdAt]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = "shorts-library.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function connectOAuth(platform: string) {

    const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback/${platform.toLowerCase()}` : '';
    let url = '';
    
    if (platform === 'YouTube') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube')}&access_type=offline&prompt=consent`;
    } else if (platform === 'Gmail') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid email https://www.googleapis.com/auth/gmail.send')}&access_type=offline&prompt=consent`;
    } else if (platform === 'Facebook') {
      const clientId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
      const targetUri = typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback/facebook` : redirectUri;
      const params = new URLSearchParams({
        client_id: clientId || "",
        redirect_uri: targetUri,
        response_type: "code",
        scope: "pages_show_list,pages_read_engagement,pages_manage_posts,public_profile",
        auth_type: "rerequest",
      });
      url = `https://www.facebook.com/v26.0/dialog/oauth?${params}`;
    } else if (platform === 'Instagram') {
      const clientId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
      const targetUri = typeof window !== 'undefined' ? `${window.location.origin}/api/auth/callback/instagram` : redirectUri;
      const params = new URLSearchParams({
        client_id: clientId || "",
        redirect_uri: targetUri,
        response_type: "code",
        scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,public_profile",
        auth_type: "rerequest",
      });
      url = `https://www.facebook.com/v26.0/dialog/oauth?${params}`;
    }
    
    if (url) {
      window.location.href = url;
    }
  }

  function handleConnectionClick(platform: string) {
    if (connections.includes(platform)) {
      setDisconnectingPlatform(platform);
    } else {
      connectOAuth(platform);
    }
  }

  async function executeDelete(deleteFromSocialsToo: boolean) {
    if (!videoToDelete) return;
    const target = videoToDelete;
    setIsDeleting(true);
    try {
      if (deleteFromSocialsToo && target.youtubeVideoId) {
        await deleteFromYouTube(target.youtubeVideoId).catch((e) => console.warn("YouTube delete notice:", e.message));
      }
      if (deleteFromSocialsToo && (target.facebookVideoId || target.facebook === 1)) {
        await deleteFromFacebook(target.facebookVideoId || "", {
          feedPostId: target.facebookPostId,
          storyId: target.facebookStoryId,
          title: target.title,
        }).catch((e) => console.warn("Facebook delete notice:", e.message));
      }
      if (deleteFromSocialsToo && (target.instagramVideoId || target.instagram === 1 || target.facebookVideoId || target.facebook === 1 || connections.includes("Instagram"))) {
        await deleteFromInstagram(target.instagramVideoId, {
          storyId: target.instagramStoryId,
          title: target.title,
        }).catch((e) => console.warn("Instagram delete notice:", e.message));
      }

      const currentUser = auth?.currentUser;
      if (currentUser) {
        deleteVideo(currentUser.uid, target.id).catch(() => {});
      }

      const cachedVideos = JSON.parse(localStorage.getItem("tvd-studio-session-videos") || "[]") as VideoRecord[];
      localStorage.setItem(
        "tvd-studio-session-videos",
        JSON.stringify(
          cachedVideos.filter(
            (video) =>
              video.id !== target.id &&
              (!target.youtubeVideoId || video.youtubeVideoId !== target.youtubeVideoId) &&
              (!target.facebookVideoId || video.facebookVideoId !== target.facebookVideoId) &&
              (!target.instagramVideoId || video.instagramVideoId !== target.instagramVideoId)
          )
        )
      );

      if (target.youtubeVideoId) {
        const hiddenVideoIds = JSON.parse(localStorage.getItem("tvd-studio-hidden-youtube-videos") || "[]") as string[];
        if (!hiddenVideoIds.includes(target.youtubeVideoId)) localStorage.setItem("tvd-studio-hidden-youtube-videos", JSON.stringify([...hiddenVideoIds, target.youtubeVideoId]));
      }

      setVideos((current) =>
        current.filter((video) => {
          if (target.youtubeVideoId && video.youtubeVideoId && video.youtubeVideoId === target.youtubeVideoId) return false;
          if (target.facebookVideoId && video.facebookVideoId && video.facebookVideoId === target.facebookVideoId) return false;
          if (target.instagramVideoId && video.instagramVideoId && video.instagramVideoId === target.instagramVideoId) return false;
          return video.id !== target.id;
        })
      );

      setToast(
        deleteFromSocialsToo && (target.youtubeVideoId || target.facebookVideoId || target.instagramVideoId || target.facebook === 1 || target.instagram === 1)
          ? "Video removed from socials and your library."
          : "Video removed from your library."
      );
      setVideoToDelete(null);
    } catch (error: any) {
      setToast(error.message);
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredVideos = videos.filter((video) => {
    const matchesFormat = filter === "All videos" || video.format === filter;
    const term = query.toLowerCase();
    const matchesQuery = `${video.title} ${video.description} ${video.hashtags.join(" ")}`.toLowerCase().includes(term);

    let matchesTab = true;
    if (platformTab === "YouTube") {
      matchesTab = video.youtube === 1;
    } else if (platformTab === "Instagram") {
      matchesTab = video.instagram === 1;
    } else if (platformTab === "Facebook") {
      matchesTab = video.facebook === 1;
    }

    return matchesFormat && matchesQuery && matchesTab;
  }).sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedVideos = filteredVideos.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  if (!signedIn) {
    return <>
      <Landing onStart={() => openAuth("signup")} onLogin={() => openAuth("login")} />
      {showAuth && <AuthDialog
        mode={authMode}
        setMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        error={authError}
        loading={loading}
        configured={firebaseConfigured}
        onClose={() => setShowAuth(false)}
        onSubmit={handleAuth}
        onPreview={enterPreview}
      />}
    </>;
  }

  return <div className="workspace">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <a className="brand" href="#studio" onClick={(event) => { event.preventDefault(); setScreen("studio"); }}><img src="/assets/theme.png" alt="The Viral Desk" style={{ height: "38px", width: "38px", objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 12px rgba(229,9,20,0.45)" }} /><span>The Viral Desk</span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Workspace">
        <button className={screen === "studio" ? "nav-item active" : "nav-item"} onClick={() => { setScreen("studio"); setMobileNav(false); }}><Scissors size={17} /> Create viral clips</button>
        <button className={screen === "library" ? "nav-item active" : "nav-item"} onClick={() => { setScreen("library"); setMobileNav(false); }}><FolderOpen size={17} /> My videos <span className="nav-count">{videos.length}</span></button>
        <button className={screen === "settings" ? "nav-item active" : "nav-item"} onClick={() => { setScreen("settings"); setMobileNav(false); }}><Settings2 size={17} /> Settings</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="usage-card"><div className="usage-heading"><span>Monthly creations</span><CircleHelp size={14} /></div><div className="usage-number">{videos.length}<span> / unlimited</span></div><div className="usage-track"><span /></div><div className="usage-note">Your next big idea starts here.</div></div>
        <div className="profile-row"><div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div><div className="profile-info"><strong>{displayName}</strong><span>{firebaseConfigured ? "Creator account" : "Preview workspace"}</span></div><button className="icon-button signout" onClick={handleSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></div>
      </div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-panel">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle menu"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>{screen === "studio" ? "Create viral clips" : screen === "library" ? "My clips" : "Settings"}</strong></div><div className="topbar-actions"><a href="/privacy" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "11px" }}>Privacy</a><a href="/terms" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "11px" }}>Terms</a><span className={`connection-pill ${firebaseConfigured ? "connected" : "preview"}`}><span />{firebaseConfigured ? "Firebase connected" : "Preview mode"}</span><button className="help-button" onClick={() => notify("Connect Firebase and platform accounts to enable production workflows.")}><CircleHelp size={16} /><span>Help</span></button></div></header>
      {screen === "studio" && <section className="studio-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE VIRAL DESK STUDIO</div><h1>Turn viral videos into <em>your content.</em></h1><p>Paste a viral video URL, split it into clips, auto-generate descriptions &amp; hashtags, and post — all free.</p></div><button className="secondary-button export-button" onClick={exportCsv}><ArrowDownToLine size={16} /> Export spreadsheet</button></div>
        <div className="creator-layout">
          <div className="creator-form">
            <div className="form-section"><div className="section-title"><span className="step-number">01</span><div><h2>Choose content category</h2><p>What type of viral content is this?</p></div></div>
              <div className="format-grid">{formats.map(({ name, icon: Icon, tone, detail }) => <button key={name} onClick={() => setSelectedCategory(name)} className={`format-option ${selectedCategory === name ? "selected" : ""}`}><span className={`format-icon ${tone}`}><Icon size={18} /></span><span className="format-copy"><strong>{name}</strong><small>{detail}</small></span>{selectedCategory === name && <Check className="format-check" size={16} />}</button>)}
              </div>
            </div>
            <div className="form-section brief-section"><div className="section-title"><span className="step-number">02</span><div><h2>Select video source</h2><p>Paste a YouTube link, or upload an MP4 file directly (zero bot blocks).</p></div></div>
              <input
                type="file"
                ref={fileInputRef}
                accept="video/mp4,video/quicktime,video/webm"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                }}
              />
              <div style={{ position: 'relative', marginTop: '8px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <div className="video-source-action-bar">
                  <div className="video-url-input-wrap">
                    <Link size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                    <input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... or direct MP4 link"
                      className="video-url-input"
                    />
                  </div>
                  <div className="video-source-buttons">
                    <button className="secondary-button" onClick={handleAutoFind} disabled={isFinding || isSplitting || isUploading}>
                      {isFinding ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                      {isFinding ? 'Finding...' : 'Auto-Find'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isFinding || isSplitting || isUploading}
                      style={{ borderColor: 'rgba(56,189,248,0.4)', color: '#38bdf8' }}
                    >
                      {isUploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
                      {isUploading ? 'Uploading...' : 'Upload MP4'}
                    </button>
                    <button className="primary-button" onClick={() => handleSplitVideo()} disabled={isSplitting || isUploading}>
                      {isSplitting ? <LoaderCircle className="spin" size={16} /> : <Scissors size={16} />}
                      {isSplitting ? 'Splitting...' : 'Split into Clips'}
                    </button>
                  </div>
                </div>

                {/* Auto-Find Source Selector (Scrape Online Viral Videos vs Direct HD vs YouTube) */}
                <div className="autofind-source-bar">
                  <span style={{ fontSize: '12px', color: '#9ca3af', flexShrink: 0 }}>Auto-Find source:</span>
                  <div className="autofind-pills">
                    <button
                      type="button"
                      onClick={() => setAutoFindSource("scrape")}
                      className={`pill-btn ${autoFindSource === "scrape" ? "active-scrape" : ""}`}
                    >
                      <Sparkles size={13} /> 🔥 Scrape Viral Online (Direct MP4)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoFindSource("direct")}
                      className={`pill-btn ${autoFindSource === "direct" ? "active-direct" : ""}`}
                    >
                      <ShieldCheck size={13} /> ⚡ Mixkit HD
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoFindSource("youtube")}
                      className={`pill-btn ${autoFindSource === "youtube" ? "active-youtube" : ""}`}
                    >
                      🎬 YouTube Shorts
                    </button>
                  </div>
                </div>

                {/* Processing Mode and Online Tools Tip */}
                <div className="runner-selector-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0 }}>Runner:</span>
                    <button
                      type="button"
                      onClick={() => setProcessMode("cloud")}
                      className={`runner-btn ${processMode === "cloud" ? "active-cloud" : ""}`}
                    >
                      ☁️ Cloud Runner (GitHub)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcessMode("queue")}
                      className={`runner-btn ${processMode === "queue" ? "active-queue" : ""}`}
                    >
                      🖥️ Desktop Worker
                    </button>
                  </div>
                  <span style={{ color: '#10b981', fontSize: '11px' }}>
                    🛡️ 100% Ban-Safe: Direct MP4 videos
                  </span>
                </div>

                {isUploading && (
                  <div style={{ marginTop: '14px', padding: '14px 16px', background: '#111218', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>
                        <LoaderCircle className="spin" size={15} />
                        <span>Uploading video file directly...</span>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>{uploadProgress}%</span>
                    </div>
                    <div style={{ height: '6px', background: '#1e2230', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )}

                {isSplitting && (
                  <div style={{ marginTop: '16px', padding: '16px 18px', background: '#111218', borderRadius: '12px', border: '1px solid #272a38', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        <LoaderCircle className="spin" size={15} style={{ color: '#e50914' }} />
                        <span>{splitStep}</span>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#ff3b45', fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(splitProgress)}%
                      </span>
                    </div>
                    <div style={{ height: '8px', background: '#1e2230', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, Math.round(splitProgress)))}%`,
                          background: 'linear-gradient(90deg, #e50914 0%, #ff3b45 100%)',
                          borderRadius: '999px',
                          boxShadow: '0 0 10px rgba(229, 9, 20, 0.6)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {clips.length > 0 && (
              <div className="form-section">
                <div className="section-title"><span className="step-number">03</span><div><h2>Review &amp; Publish Clips</h2><p>{clips.length} clips ready from &quot;{sourceTitle}&quot;. Each has auto-generated description &amp; hashtags.</p></div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                  {clips.map((clip) => {
                    const result = clipResults[clip.partNumber];
                    return (
                      <div key={clip.partNumber} style={{ border: '1.5px solid #1f2230', borderRadius: '14px', padding: '16px', background: '#151722', boxShadow: '0 8px 25px rgba(0,0,0,0.4)', maxWidth: '100%', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', width: '100%', maxWidth: '100%' }}>
                          <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: '100%', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{ background: 'linear-gradient(135deg,#e50914,#b20710)', color: '#fff', fontWeight: 800, fontSize: '11px', padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.05em', boxShadow: '0 0 12px rgba(229,9,20,0.4)' }}>{clip.title}</span>
                              <span style={{ fontSize: '12px', color: '#9ca3af' }}>{Math.round(clip.duration)}s</span>
                              {result?.status === 'done' && <span style={{ background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: '11px', padding: '2px 8px', borderRadius: '20px' }}>✅ Published</span>}
                              {result?.status === 'publishing' && <span style={{ background: '#fef9c3', color: '#a16207', fontWeight: 700, fontSize: '11px', padding: '2px 8px', borderRadius: '20px' }}>⏳ Publishing...</span>}
                              {result?.status === 'error' && <span style={{ background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: '11px', padding: '2px 8px', borderRadius: '20px' }}>❌ Failed</span>}
                            </div>
                            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>{clip.description}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {Array.from(new Set(clip.hashtags)).map((tag, idx) => <span key={`${tag}-${idx}`} style={{ background: 'rgba(229,9,20,0.12)', color: '#ff4d56', fontSize: '11px', padding: '3px 9px', borderRadius: '6px', fontWeight: 600 }}>#{tag.replace(/^#/, '')}</span>)}
                            </div>
                            {result?.status === 'done' && (
                              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {result.youtubeUrl && (
                                  <a href={result.youtubeUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#ff4444', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
                                    <FaYoutube size={14} /> YouTube
                                  </a>
                                )}
                                {result.facebookUrl && (
                                  <a href={result.facebookUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
                                    <FaFacebookF size={13} /> Facebook
                                  </a>
                                )}
                                {result.instagramUrl && (
                                  <a href={result.instagramUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#f472b6', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
                                    <FaInstagram size={13} /> Instagram
                                  </a>
                                )}
                              </div>
                            )}
                            {result?.status === 'error' && <p style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{result.error}</p>}
                          </div>
                          <button
                            className="secondary-button"
                            onClick={() => handlePublishClip(clip)}
                            disabled={result?.status === 'publishing' || result?.status === 'done'}
                            style={{ flexShrink: 0, opacity: result?.status === 'done' ? 0.5 : 1 }}
                          >
                            {result?.status === 'publishing' ? <LoaderCircle className="spin" size={14} /> : <Share2 size={14} />}
                            {result?.status === 'done' ? 'Published' : result?.status === 'publishing' ? 'Publishing...' : 'Publish'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="prompt-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '20px' }}>
                  <button className="primary-button" onClick={handlePublishAllClips} disabled={isPublishingAll || clips.every((c) => clipResults[c.partNumber]?.status === 'done')}>
                    {isPublishingAll ? <LoaderCircle className="spin" size={16} /> : <Share2 size={16} />}
                    {isPublishingAll ? 'Publishing All...' : 'Publish All Clips'} <ArrowRight size={15} />
                  </button>
                  <button className="secondary-button" onClick={() => setScreen('library')}><FolderOpen size={15} /> View Library</button>
                </div>
              </div>
            )}
          </div>
          <aside className="preview-panel">
            <div className="preview-head"><div><span className="preview-kicker">WORKFLOW</span><h3>Automated Studio Pipeline</h3></div><span className="preview-status"><span /> ACTIVE</span></div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { step: '01', icon: '🔗', title: 'Input Source Video', desc: 'Compatible with YouTube, TikTok, X, Instagram & direct .mp4' },
                { step: '02', icon: '✂️', title: 'Intelligent Segmentation', desc: 'Automatically segmented into optimal vertical short slices' },
                { step: '03', icon: '✍️', title: 'Metadata & Outro Injection', desc: 'Tailored descriptions, hashtags & branded outro attached' },
                { step: '04', icon: '🚀', title: 'Multi-Platform Syndication', desc: 'Simultaneous distribution to YouTube Shorts, FB & IG Reels' },
                { step: '05', icon: '📧', title: 'Automated Delivery Alert', desc: 'Published post links delivered directly to your Gmail inbox' },
                { step: '06', icon: '🗑️', title: 'Storage Optimization', desc: 'Temporary slice files purged automatically after upload' },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ background: 'linear-gradient(135deg,#e50914,#b20710)', color: '#fff', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, flexShrink: 0, boxShadow: '0 0 10px rgba(229,9,20,0.4)' }}>{step}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#ffffff' }}>{icon} {title}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4, marginTop: '2px' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="preview-bottom"><span><span className="quality-dot" /> High Definition</span><span>Zero API costs · 100% Free</span></div>
          </aside>
        </div>
        <div className="below-stats">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span className="stat-icon" style={{ width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0 }}><Clapperboard size={11} /></span>
            <span><strong style={{ color: '#ffffff', fontWeight: 700 }}>{videos.length}</strong> {videos.length === 1 ? 'clip' : 'clips'} in library</span>
          </div>
          <span style={{ color: '#272a38', userSelect: 'none', flexShrink: 0 }}>•</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span className="stat-icon warm" style={{ width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0 }}><TrendingUp size={11} /></span>
            <span><strong style={{ color: '#ffffff', fontWeight: 700 }}>Automated Pipeline:</strong> 9:16 cuts + outro</span>
          </div>
          <button onClick={() => setScreen("library")}>
            Open Library <ArrowRight size={11} />
          </button>
        </div>
      </section>}
      {screen === "library" && <section className="library-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR CLIPS LIBRARY</div><h1>Viral content, <em>in motion.</em></h1><p>Your published clips with direct links to YouTube, Facebook, and Instagram.</p></div><div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}><button className="secondary-button" onClick={handleClearLibrary} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#ef4444' }} title="Clear all videos from your library"><Trash2 size={15} /> Clear library</button><button className="secondary-button" onClick={exportCsv}><ArrowDownToLine size={16} /> Export spreadsheet</button></div></div>
      
      <div className="library-tabber">
        {["All", "YouTube", "Facebook", "Instagram"].map(tab => (
          <button 
            key={tab} 
            onClick={() => { setPlatformTab(tab); setCurrentPage(1); }}
            className={`tab-pill ${platformTab === tab ? "active" : ""}`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div className="library-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }}
            placeholder="Search your clips"
          />
        </div>
        <label className="filter-select">
          <span className="sr-only">Filter by category</span>
          <select value={filter} onChange={(event) => { setFilter(event.target.value); setCurrentPage(1); }}>
            <option>All videos</option>
            {formats.map((item) => <option key={item.name}>{item.name}</option>)}
          </select>
          <ChevronDown size={15} />
        </label>
        <span className="result-count">
          {filteredVideos.length > PAGE_SIZE
            ? `Showing ${(safeCurrentPage - 1) * PAGE_SIZE + 1}–${Math.min(safeCurrentPage * PAGE_SIZE, filteredVideos.length)} of ${filteredVideos.length} clips`
            : `${filteredVideos.length} clips`}
        </span>
      </div>
      {paginatedVideos.length ? <> <div className="video-grid">
  {paginatedVideos.map((video) => {
    const ytId = video.youtube === 1 ? (video.youtubeVideoId || (() => {
      const m = (video.youtubeUrl || video.videoUrl)?.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|live\/)([^#&?]*)/);
      return m && m[1]?.length === 11 ? m[1] : "";
    })()) : "";

    const thumbUrl =
      (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : "") ||
      (video.facebook === 1 && video.facebookVideoId ? `/api/viral-clips/thumbnail?facebookId=${video.facebookVideoId}` : "") ||
      (video.thumbnailUrl && !video.thumbnailUrl.includes("story") ? video.thumbnailUrl : "") ||
      (video.cloudinaryUrl ? video.cloudinaryUrl.replace(/\.[^.]+$/, ".jpg") : "") ||
      (video.videoUrl && video.videoUrl.includes("res.cloudinary.com") ? video.videoUrl.replace(/\.[^.]+$/, ".jpg") : "") ||
      `/api/viral-clips/thumbnail?format=${encodeURIComponent(video.format || "Trending")}`;

    const targetLink =
      (video.youtube === 1 && video.youtubeUrl)
        ? video.youtubeUrl
        : (video.facebook === 1 && video.facebookUrl)
        ? video.facebookUrl
        : (video.instagram === 1 && video.instagramUrl)
        ? video.instagramUrl
        : (video.cloudinaryUrl || video.videoUrl || "#");

    const isPlayableRemote =
      !thumbUrl &&
      video.videoUrl &&
      (video.videoUrl.startsWith("http://") || video.videoUrl.startsWith("https://")) &&
      !video.videoUrl.includes("youtube.com") &&
      !video.videoUrl.includes("youtu.be");

    return (
      <article className="video-card" key={video.id}>
        {video.status === 'failed' ? (
          <div className="video-thumb" style={{ background: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#d32f2f', fontWeight: 'bold' }}>FAILED</span></div>
        ) : (
          <div className="video-thumb video-thumb-preview">
            {thumbUrl ? (
              <a
                href={targetLink}
                target="_blank"
                rel="noreferrer"
                aria-label={`Watch ${video.title}`}
                style={{
                  backgroundImage: `url(${thumbUrl})`,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "absolute",
                  inset: 0,
                  textDecoration: "none",
                }}
              >
                <span className="thumb-play">
                  <Play size={18} fill="white" />
                </span>
              </a>
            ) : isPlayableRemote ? (
              <video
                src={video.videoUrl}
                controls
                playsInline
                preload="metadata"
                aria-label={`Play ${video.title}`}
                onLoadedData={(event) => {
                  const player = event.currentTarget;
                  if (player.currentTime === 0 && Number.isFinite(player.duration) && player.duration > 0) player.currentTime = Math.min(0.1, player.duration / 2);
                }}
              />
            ) : (
              <span className="thumb-unavailable">Preview unavailable</span>
            )}
            <span className="thumb-tag">{video.format}</span>
          </div>
        )}
    <div className="video-details">
      <div className="video-type-label"><Film size={11} /> {video.format || "Viral Clip"}</div>
      <h3>{video.title}</h3>
      <p style={{ color: video.status === 'failed' ? '#d32f2f' : 'inherit' }}>{video.description}</p>
      {video.status !== 'failed' && <div className="hashtag-row">{Array.from(new Set(video.hashtags || [])).map((tag, idx) => <span key={`${tag}-${idx}`}>#{tag.replace(/^#/, '')}</span>)}</div>}
      <div className="video-card-actions">
        <div className="card-platform-links">
          {video.youtube === 1 && Boolean(video.youtubeUrl) && (
            <a
              href={video.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="platform-btn yt-btn"
              title="Watch on YouTube Shorts"
            >
              <FaYoutube size={12} />
              <span>Shorts</span>
            </a>
          )}
          {video.facebook === 1 && Boolean(video.facebookUrl) && (
            <a
              href={video.facebookUrl}
              target="_blank"
              rel="noreferrer"
              className="platform-btn fb-btn"
              title="Watch Facebook Reel"
            >
              <FaFacebookF size={11} />
              <span>FB Reel</span>
            </a>
          )}
          {video.instagram === 1 && Boolean(video.instagramUrl) && (
            <a
              href={video.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="platform-btn ig-btn"
              title="Watch Instagram Reel"
            >
              <FaInstagram size={12} />
              <span>IG Reel</span>
            </a>
          )}
        </div>
        <div className="card-footer-meta">
          <span className="card-date">{video.createdAt ? String(video.createdAt).slice(0, 10) : ""}</span>
          <div className="card-footer-tools">
            {video.youtube !== 1 && video.facebook !== 1 && video.instagram !== 1 && (video.cloudinaryUrl || (video.videoUrl && !video.videoUrl.includes("youtube.com/"))) && (
              <a href={video.cloudinaryUrl || video.videoUrl} download className="footer-tool-btn" title="Download video">
                <Download size={13} />
              </a>
            )}
            <button
              className="footer-tool-btn delete-tool"
              onClick={() => setVideoToDelete(video)}
              title="Delete video"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div></article>
    );
  })}</div>
  {totalPages > 1 && (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '28px', paddingBottom: '16px', flexWrap: 'wrap' }}>
      <button
        className="secondary-button"
        onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); }}
        disabled={safeCurrentPage === 1}
        style={{ padding: '6px 14px', fontSize: '13px', opacity: safeCurrentPage === 1 ? 0.4 : 1 }}
      >
        Previous
      </button>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => { setCurrentPage(page); }}
            className={`tab-pill ${safeCurrentPage === page ? "active" : ""}`}
            style={{ minWidth: '34px', height: '34px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: safeCurrentPage === page ? 700 : 500 }}
          >
            {page}
          </button>
        ))}
      </div>
      <button
        className="secondary-button"
        onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); }}
        disabled={safeCurrentPage === totalPages}
        style={{ padding: '6px 14px', fontSize: '13px', opacity: safeCurrentPage === totalPages ? 0.4 : 1 }}
      >
        Next
      </button>
    </div>
  )}
  </> : <div className="empty-library"><div className="empty-art"><span /><span /><span /><Clapperboard size={27} /></div><h2>{query || filter !== "All videos" ? "No matching clips" : "No clips published yet."}</h2><p>{query || filter !== "All videos" ? "Try another search or category." : "Published viral clips will appear here with YouTube, Facebook, and Instagram links."}</p>{!query && filter === "All videos" && <button className="primary-button" onClick={() => setScreen("studio")}><TrendingUp size={16} /> Create your first viral clip</button>}</div>}</section>}
      {screen === "settings" && <section className="settings-content"><div className="eyebrow"><span className="eyebrow-dot" /> WORKSPACE SETTINGS</div><h1>Your studio, <em>your way.</em></h1><p className="settings-intro">Manage automated workflows and connected social networks.</p>
      
      {/* Auto-Pilot Daily Automation Toggler (Requirement 8) */}
      <div style={{ background: '#111218', border: '1.5px solid #232635', borderRadius: '12px', padding: '22px', marginBottom: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #e50914, #ff3b45)', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 0 16px rgba(229,9,20,0.5)', flexShrink: 0 }}>
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>Daily Auto-Pilot Automation</h2>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', background: autoPilotEnabled ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.15)', color: autoPilotEnabled ? '#4ade80' : '#94a3b8' }}>
                  {autoPilotEnabled ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                Automatically find viral videos with random types every day and publish clips across all your connected socials.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              const nextState = !autoPilotEnabled;
              setAutoPilotEnabled(nextState);
              localStorage.setItem("tvd-auto-pilot", String(nextState));
              if (database) {
                try {
                  await setDoc(doc(database, "app_config", "auto_pilot"), { enabled: nextState, updatedAt: new Date().toISOString() }, { merge: true });
                } catch (e) {}
              }
              notify(nextState ? "🔥 Auto-Pilot enabled! Paste the webhook URL into your cron service." : "Auto-Pilot disabled.");
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: autoPilotEnabled ? '1px solid #22c55e' : '1px solid #33384a',
              background: autoPilotEnabled ? 'rgba(34,197,94,0.15)' : '#181a24',
              color: autoPilotEnabled ? '#4ade80' : '#cbd5e1',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: autoPilotEnabled ? '#22c55e' : '#64748b' }} />
            {autoPilotEnabled ? "Auto-Pilot ON" : "Auto-Pilot OFF"}
          </button>
        </div>

        {autoPilotEnabled && (
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #1f2230' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
              🔗 Free Cron Job Webhook URL:
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : 'https://the-viral-desk.vercel.app'}/api/cron/publish`}
                style={{ flex: '1 1 280px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #272a38', background: '#0a0b10', color: '#38bdf8', fontSize: '12px', outline: 'none' }}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const link = `${window.location.origin}/api/cron/publish`;
                  navigator.clipboard.writeText(link);
                  notify("Webhook URL copied to clipboard! Paste it into cron-job.org.");
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                📋 Copy Link
              </button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
              💡 <strong>How to schedule daily:</strong> Create a free account on <a href="https://cron-job.org" target="_blank" rel="noreferrer" style={{ color: '#ff3b45', textDecoration: 'underline' }}>cron-job.org</a>, create a new job, paste this URL, and set execution to once per day. It will automatically discover viral videos, cut vertical clips, and publish them to YouTube, Facebook, and Instagram with Gmail alerts.
            </p>
          </div>
        )}
      </div>

      <div className="settings-row"><div className="settings-icon youtube-icon"><FaYoutube size={22} /></div><div className="settings-copy"><h2>YouTube publishing</h2><p>Connect YouTube to publish viral clips directly to your channel.</p></div><button className={`secondary-button ${connections.includes("YouTube") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("YouTube")}>{connections.includes("YouTube") ? "Disconnect" : "Connect"}</button></div><div className="settings-row"><div className="settings-icon instagram-icon"><FaInstagram size={21} /></div><div className="settings-copy"><h2>Instagram publishing</h2><p>Connect Instagram to automatically post viral clips as Reels.</p></div><button className={`secondary-button ${connections.includes("Instagram") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("Instagram")}>{connections.includes("Instagram") ? "Disconnect" : "Connect"}</button></div><div className="settings-row"><div className="settings-icon facebook-icon"><FaFacebookF size={19} /></div><div className="settings-copy"><h2>Facebook publishing</h2><p>Connect Facebook to cross-post your viral clips as Facebook Reels.</p></div><button className={`secondary-button ${connections.includes("Facebook") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("Facebook")}>{connections.includes("Facebook") ? "Disconnect" : "Connect"}</button></div><div className="settings-row"><div className="settings-icon gmail-icon"><SiGmail size={19} /></div><div className="settings-copy"><h2>Gmail notifications</h2><p>Connect Gmail to receive post links (YouTube, Facebook, Instagram) after each clip is published.</p></div><button className={`secondary-button ${connections.includes("Gmail") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("Gmail")}>{connections.includes("Gmail") ? "Disconnect" : "Connect"}</button></div><div className="settings-note"><CircleHelp size={17} /><p>100% free workflow: local yt-dlp + ffmpeg for splitting, smart rule-based descriptions &amp; hashtags, direct posting to your connected platforms. No paid services or API keys needed.</p></div></section>}
      <footer className="workspace-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/assets/theme.png" alt="The Viral Desk" style={{ height: "30px", width: "30px", objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 10px rgba(229,9,20,0.45)" }} />
          <span style={{ fontWeight: 800, fontSize: "14px", color: "#ffffff", letterSpacing: "-0.3px" }}>The Viral Desk</span>
          <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "4px" }}>| Viral Clips &amp; Social Automation</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "12px", fontWeight: 500 }}>Privacy Policy</a>
          <span style={{ color: "#222533" }}>•</span>
          <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "12px", fontWeight: 500 }}>Terms &amp; Conditions</a>
          <span style={{ color: "#222533" }}>•</span>
          <span style={{ color: "#64748b", fontSize: "12px" }}>&copy; 2026 The Viral Desk</span>
        </div>
      </footer>
    </main>
    {toast && <div className="toast-message"><span className="toast-check"><Check size={14} /></span>{toast}</div>}
    {disconnectingPlatform && (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDisconnectingPlatform(null); }}>
        <section className="auth-modal" role="dialog">
          <button className="icon-button modal-close" onClick={() => setDisconnectingPlatform(null)} aria-label="Close"><X size={19} /></button>
          <div className="eyebrow"><span className="eyebrow-dot" style={{ background: '#ea4335' }} /> DISCONNECT</div>
          <h2 id="auth-title">Disconnect {disconnectingPlatform}?</h2>
          <p>Are you sure you want to disconnect your {disconnectingPlatform} account? You will need to reconnect to use its features.</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button className="secondary-button" style={{ flex: 1 }} onClick={() => setDisconnectingPlatform(null)}>Cancel</button>
            <button className="primary-button" style={{ flex: 1, background: '#ea4335', borderColor: '#ea4335' }} onClick={async () => {
              const platformToDisconnect = disconnectingPlatform;
              const newConns = connections.filter(c => c !== platformToDisconnect);
              setConnections(newConns);
              localStorage.setItem("app_connections", JSON.stringify(newConns));
              setDisconnectingPlatform(null);
              try {
                await fetch("/api/auth/disconnect", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ platform: platformToDisconnect }),
                });
                const statusRes = await fetch("/api/auth/status");
                const statusData = await statusRes.json();
                if (Array.isArray(statusData.connections)) {
                  setConnections(statusData.connections);
                  localStorage.setItem("app_connections", JSON.stringify(statusData.connections));
                }
              } catch {}
              notify(`${platformToDisconnect} disconnected.`);
            }}>Disconnect</button>
          </div>
        </section>
      </div>
    )}
    {videoToDelete && (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !isDeleting) setVideoToDelete(null); }}>
        <section className="auth-modal" role="dialog" style={{ maxWidth: '400px' }}>
          {!isDeleting && <button className="icon-button modal-close" onClick={() => setVideoToDelete(null)} aria-label="Close"><X size={19} /></button>}
          <div className="eyebrow"><span className="eyebrow-dot" style={{ background: '#ea4335' }} /> DELETE VIDEO</div>
          <h2 id="auth-title">Delete "{videoToDelete.title}"?</h2>
          <p>Where would you like to delete this video from?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
            <button className="primary-button" disabled={isDeleting} onClick={() => executeDelete(false)} style={{ justifyContent: 'center' }}>
              {isDeleting ? <LoaderCircle className="spin" size={17} /> : "Remove from Library Only"}
            </button>
            { (videoToDelete.youtubeVideoId || videoToDelete.facebookVideoId || videoToDelete.instagramVideoId || videoToDelete.youtube === 1 || videoToDelete.facebook === 1 || videoToDelete.instagram === 1) && (
              <button className="secondary-button" disabled={isDeleting} onClick={() => executeDelete(true)} style={{ justifyContent: 'center', borderColor: '#ea4335', color: '#ea4335', backgroundColor: '#ea433511' }}>
                {isDeleting ? <LoaderCircle className="spin" size={17} /> : "Delete from Library & Socials"}
              </button>
            )}
            <button className="secondary-button" disabled={isDeleting} onClick={() => setVideoToDelete(null)} style={{ justifyContent: 'center', border: 'none' }}>Cancel</button>
          </div>
        </section>
      </div>
    )}
  </div>;
}

function Landing({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  return <main className="landing-page"><nav className="landing-nav"><a className="brand landing-brand" href="#top"><img src="/assets/theme.png" alt="The Viral Desk" style={{ height: "42px", width: "42px", objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 16px rgba(229,9,20,0.45)" }} /><span>The Viral Desk</span></a><div className="landing-links"><a href="#how-it-works">How it works</a><a href="#formats">Formats</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></div><div className="landing-actions"><button className="text-button" onClick={onLogin}>Log in</button><button className="nav-cta" onClick={onStart}>Start creating <ArrowRight size={15} /></button></div></nav>
    <section className="landing-hero" id="top"><div className="hero-copy"><div className="hero-kicker"><span className="live-dot" /> VIRAL CLIPS & SOCIAL AUTOMATION</div><h1>Turn viral videos into<br /><em>your content.</em></h1><p>Paste any viral video URL or auto-find trending videos. Split them into parts, generate tailored descriptions & hashtags, and post across socials — 100% free.</p><div className="hero-actions"><button className="hero-cta" onClick={onStart}>Create your first clip <ArrowRight size={17} /></button><span className="hero-meta"><span className="hero-avatars"><i>J</i><i>M</i><i>A</i></span>Made for curious creators</span></div><div className="hero-proof"><span><Check size={14} /> Vertical-first ideas</span><span><Check size={14} /> Your style, your story</span></div></div><div className="hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="hero-poster poster-back"><span className="poster-label">TINY MOMENTS</span><div className="poster-flower"><i /><i /><i /><i /><i /><b /></div><span className="poster-bottom">somewhere<br />between seconds</span></div><div className="hero-poster poster-front"><div className="poster-image image-ceramic" /><div className="poster-gradient" /><span className="poster-topline">THE VIRAL DESK <i>✳</i></span><span className="poster-caption">little things<br /><em>feel big.</em></span><span className="poster-play"><Play size={16} fill="currentColor" /></span><span className="poster-duration">0:09</span></div><div className="float-note note-top"><span><Sparkles size={15} /></span><div><strong>One little idea</strong><small>Endless viral reach</small></div></div><div className="float-note note-bottom"><span className="note-music"><Music2 size={16} /></span><div><strong>Made to be replayed</strong><small>9 seconds · feels like more</small></div></div><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✳</span></div><div className="hero-scroll">SCROLL TO MAKE SOMETHING <span>↓</span></div></section>
    <section className="format-strip" id="formats"><div className="strip-label">A FORMAT FOR<br />EVERY LITTLE OBSESSION</div><div className="strip-items">{formats.slice(0, 6).map(({ name, icon: Icon, tone }) => <div className="strip-item" key={name}><span className={`format-icon ${tone}`}><Icon size={17} /></span><span>{name}</span></div>)}<div className="strip-item more-formats"><span className="format-icon custom-tone"><Plus size={17} /></span><span>And your own</span></div></div></section>
    <section className="how-section" id="how-it-works"><div className="how-heading"><div className="eyebrow"><span className="eyebrow-dot" /> FROM SPARK TO SHORT</div><h2>A tiny process.<br /><em>A whole lot of possibility.</em></h2></div><div className="how-steps"><article><span className="how-number">01</span><span className="how-icon icon-pick"><Film size={20} /></span><h3>Pick a feeling</h3><p>ASMR, mini stories, nature, or the niche only you could dream up.</p></article><article><span className="how-number">02</span><span className="how-icon icon-shape"><Sparkles size={20} /></span><h3>Auto-split into clips</h3><p>Automatically cut videos into parts with tailored descriptions and 8-10 hashtags.</p></article><article><span className="how-number">03</span><span className="how-icon icon-loop"><Play size={20} /></span><h3>Publish across socials</h3><p>One-click publish to YouTube, Facebook, and Instagram with Gmail delivery.</p></article></div></section>
    <section className="landing-end"><span className="end-star">✳</span><div className="eyebrow">THE NEXT NINE SECONDS ARE YOURS</div><h2>What will you <em>create next?</em></h2><button className="hero-cta" onClick={onStart}>Start your studio <ArrowRight size={17} /></button><p>Free to explore · Your ideas stay yours</p></section><footer className="landing-footer"><a className="brand landing-brand" href="#top"><img src="/assets/theme.png" alt="The Viral Desk" style={{ height: "32px", width: "32px", objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 10px rgba(229,9,20,0.45)" }} /><span>The Viral Desk</span></a><div style={{ display: "flex", gap: "16px", alignItems: "center" }}><a href="/privacy" style={{ color: "#94a3b8", textDecoration: "none" }}>Privacy Policy</a><span style={{ color: "#272a38" }}>•</span><a href="/terms" style={{ color: "#94a3b8", textDecoration: "none" }}>Terms &amp; Conditions</a></div><span>© 2026 The Viral Desk</span></footer></main>;
}

function AuthDialog({ mode, setMode, email, setEmail, password, setPassword, error, loading, configured, onClose, onSubmit, onPreview }: {
  mode: "login" | "signup";
  setMode: (mode: "login" | "signup") => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  error: string;
  loading: boolean;
  configured: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPreview: () => void;
}) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button><span className="modal-mark"><Play size={19} fill="currentColor" /></span><div className="eyebrow"><span className="eyebrow-dot" /> YOUR CREATOR SPACE</div><h2 id="auth-title">{mode === "signup" ? "Let's make a little magic." : "Welcome back."}</h2><p>{mode === "signup" ? "Create your studio and keep all your shorts in one place." : "Pick up right where your next idea left off."}</p><form onSubmit={onSubmit}><label className="field-label">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" /></label><label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>{error && <p className="auth-error">{error}</p>}<button className="primary-button auth-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <>{mode === "signup" ? "Create my studio" : "Log in"}<ArrowRight size={16} /></>}</button></form><div className="auth-switch">{mode === "signup" ? "Already have a studio?" : "New around here?"} <button onClick={() => setMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Log in" : "Create an account"}</button></div>{!configured && <><div className="modal-divider"><span>OR</span></div><button className="preview-button" onClick={onPreview}>Explore the studio preview <ArrowRight size={15} /></button><div className="preview-caption-modal">Firebase isn't configured yet. Preview mode won't save your work.</div></>}</section></div>;
}
