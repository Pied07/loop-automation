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
  ExternalLink,
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
  Volume2,
  VolumeX,
  Swords,
} from "lucide-react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { auth, firebaseConfigured, database, listenToVideos, saveVideo, deleteVideo, clearAllUserVideos, normalizeVideoRecord, type VideoRecord } from "./firebase";
import { doc, onSnapshot, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { deleteFromYouTube, deleteFromFacebook, deleteFromInstagram, deleteFromCloudinary } from "./actions";
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
  { name: "Interesting Facts", icon: TrendingUp, tone: "mint", detail: "Untold facts & real world origins" },
  { name: "Comedy", icon: AudioLines, tone: "yellow", detail: "Funny & entertaining" },
  { name: "Motivational", icon: Sparkles, tone: "mint", detail: "Inspiring moments" },
  { name: "Horror", icon: Flame, tone: "coral", detail: "Spooky & thrilling" },
  { name: "Educational", icon: Lightbulb, tone: "blue", detail: "Learn something new" },
  { name: "Romance", icon: Flower2, tone: "pink", detail: "Love & emotion" },
  { name: "Adventure", icon: Mountain, tone: "sky", detail: "Action & outdoors" },
  { name: "Action", icon: Swords, tone: "coral", detail: "High-octane battles & thrilling stunts" },
  { name: "Others", icon: WandSparkles, tone: "gold", detail: "Custom story tag & theme" },
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

  // 10. Description match & script snippet match
  const descA = normalizeDescription(a.description);
  const descB = normalizeDescription(b.description);
  if (descA && descB && descA.length >= 15 && descA === descB) {
    return true;
  }
  const cleanSnippetA = (a.description || a.title || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 45).toLowerCase();
  const cleanSnippetB = (b.description || b.title || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 45).toLowerCase();
  if (cleanSnippetA.length >= 22 && cleanSnippetB.length >= 22 && cleanSnippetA === cleanSnippetB) {
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

    const isAi = records.some((r) => r.isAiVideo);
    const resolvedFormat = records.find((r) => r.isAiVideo && r.format && r.format !== "Viral")?.format ||
      records.find((r) => r.format && r.format !== "Trending" && r.format !== "Viral")?.format ||
      winner.format;

    const mergedRecord: VideoRecord = {
      ...winner,
      id: winner.id,
      title: bestTitle,
      description: bestDesc,
      hashtags: Array.from(allHashtags),
      videoUrl: bestVideoUrl,
      thumbnailUrl: bestThumb,
      isAiVideo: isAi,
      format: resolvedFormat,
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
  const [selectedCategory, setSelectedCategory] = useState("Interesting Facts");
  const [customStoryTag, setCustomStoryTag] = useState("");
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
  const [autoFindSource, setAutoFindSource] = useState<"scrape" | "youtube">("scrape");
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
  const [outroUrl, setOutroUrl] = useState<string>("/assets/video-outro.mp4");
  const [isCustomOutro, setIsCustomOutro] = useState<boolean>(false);
  const [outroUpdatedAt, setOutroUpdatedAt] = useState<string | null>(null);
  const [isUploadingOutro, setIsUploadingOutro] = useState<boolean>(false);
  const [studioMode, setStudioMode] = useState<"viral" | "ai">("viral");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiVoice, setAiVoice] = useState("en-US-ChristopherNeural");
  const [aiNumImages, setAiNumImages] = useState<number>(5);
  const [aiDuration, setAiDuration] = useState<number>(60);
  const [aiNumParts, setAiNumParts] = useState<number>(1);
  const [aiCurrentPart, setAiCurrentPart] = useState<number>(1);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [generatedStoryParts, setGeneratedStoryParts] = useState<any[]>([]);
  const [selectedSceneStyle, setSelectedSceneStyle] = useState<string>("Realism");
  const [selectedCaptionStyle, setSelectedCaptionStyle] = useState<string>("viral_yellow");
  const [generatingSceneIdx, setGeneratingSceneIdx] = useState<number | null>(null);
  const [isGeneratingAllScenes, setIsGeneratingAllScenes] = useState<boolean>(false);
  const [colabGpuUrl, setColabGpuUrl] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("colab_gpu_bridge_url");
      if (saved) setColabGpuUrl(saved);
    }
  }, []);

  const [lastFactId, setLastFactId] = useState<string>("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isGeneratingAiVideo, setIsGeneratingAiVideo] = useState(false);
  const [aiProgress, setAiProgress] = useState<number>(0);
  const [aiProgressStep, setAiProgressStep] = useState<string>("");
  const [generatedAiVideo, setGeneratedAiVideo] = useState<any>(null);
  const [generatedAiVideosList, setGeneratedAiVideosList] = useState<any[]>([]);
  const [previewPartIdx, setPreviewPartIdx] = useState<number>(0);
  const [isPublishingAi, setIsPublishingAi] = useState(false);
  const [isPublishingAllAi, setIsPublishingAllAi] = useState(false);
  const [aiPlatforms, setAiPlatforms] = useState({ youtube: true, facebook: true, instagram: true });
  const [cronContentType, setCronContentType] = useState<"viral" | "ai" | "both">("viral");
  const [cronSelectionMode, setCronSelectionMode] = useState<"random" | "chosen">("random");
  const [repostingKey, setRepostingKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outroFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/api/outro")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.url) {
            setOutroUrl(data.url);
            setIsCustomOutro(Boolean(data.isCustom));
            setOutroUpdatedAt(data.updatedAt || null);
          }
        })
        .catch(() => {});

      try {
        const storedAuto = localStorage.getItem("tvd-auto-pilot") === "true";
        setAutoPilotEnabled(storedAuto);
        const storedCronType = localStorage.getItem("tvd-cron-content-type") as "viral" | "ai" | "both";
        if (storedCronType) setCronContentType(storedCronType);
        if (database) {
          getDoc(doc(database, "app_config", "auto_pilot"))
            .then((snap) => {
              if (snap.exists()) {
                const d = snap.data();
                if (typeof d?.enabled === "boolean") {
                  setAutoPilotEnabled(d.enabled);
                  localStorage.setItem("tvd-auto-pilot", String(d.enabled));
                }
                if (d?.contentType) {
                  setCronContentType(d.contentType);
                  localStorage.setItem("tvd-cron-content-type", d.contentType);
                }
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
        setDoc(doc(database, "app_config", "auto_pilot"), {
          ownerUserId: user.uid,
          ownerEmail: user.email || "",
        }, { merge: true }).catch(() => {});
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
        body: JSON.stringify({ category: "Viral", mode: autoFindSource }),
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

  async function handleOutroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("video") && !file.name.endsWith(".mp4") && !file.name.endsWith(".mov")) {
      notify("Please choose an MP4 or MOV video file.");
      return;
    }
    setIsUploadingOutro(true);
    notify("Uploading new outro video & replacing old outro...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/outro", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to upload outro");
      setOutroUrl(data.url);
      setIsCustomOutro(true);
      setOutroUpdatedAt(data.updatedAt || new Date().toISOString());
      notify("🎬 New outro video active! Previous outro was deleted.");
    } catch (err: any) {
      notify("Outro upload failed: " + err.message);
    } finally {
      setIsUploadingOutro(false);
      if (outroFileInputRef.current) outroFileInputRef.current.value = "";
    }
  }

  async function handleResetOutro() {
    setIsUploadingOutro(true);
    try {
      const res = await fetch("/api/outro", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not reset outro");
      setOutroUrl("/assets/video-outro.mp4");
      setIsCustomOutro(false);
      setOutroUpdatedAt(null);
      notify("Default outro restored.");
    } catch (err: any) {
      notify("Reset failed: " + err.message);
    } finally {
      setIsUploadingOutro(false);
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
          sourceUrl: c.sourceUrl || c.sourceLink || videoUrl || "",
          sourceLink: c.sourceLink || c.sourceUrl || videoUrl || "",
          isCron: Boolean(c.isCron || (c.id && String(c.id).includes("cron"))),
          format: "Viral",
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
          contentCategory: "Viral",
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

  function playSampleVoice(voiceId: string) {
    if (playingVoiceId === voiceId) {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        sampleAudioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
    }

    const soundMap: Record<string, string> = {
      "en-US-ChristopherNeural": "/voice_sample_christopher.mp3",
      "en-US-JennyNeural": "/voice_sample_jenny.mp3",
      "en-US-GuyNeural": "/voice_sample_guy.mp3",
      "en-US-AriaNeural": "/voice_sample_aria.mp3",
      "en-US-BrianNeural": "/voice_sample_brian.mp3",
      "en-US-EmmaNeural": "/voice_sample_emma.mp3",
    };

    const src = soundMap[voiceId] || "/voice_sample_christopher.mp3";
    const audio = new Audio(src);
    sampleAudioRef.current = audio;
    setPlayingVoiceId(voiceId);
    audio.play().catch(() => {});
    audio.onended = () => {
      setPlayingVoiceId(null);
      sampleAudioRef.current = null;
    };
  }

  function validateStudioInputs(): string | null {
    if (!selectedCategory) {
      return "Please choose a content category first.";
    }
    if (selectedCategory === "Others" && !customStoryTag.trim()) {
      return "Please describe your custom story tag/theme for 'Others' first.";
    }
    if (!aiVoice) {
      return "Please select an AI narrator voice first.";
    }
    if (!aiDuration || aiDuration < 10 || aiDuration > 120) {
      return "Please select a video duration timer between 10s and 120s.";
    }
    if (!aiNumImages || aiNumImages < 1 || aiNumImages > 5) {
      return "Please select the number of AI scene images (1 to 20).";
    }
    if (!aiNumParts || aiNumParts < 1 || aiNumParts > 5) {
      return "Please select the number of parts (1 to 5).";
    }
    return null;
  }

  async function handleAutoGenerateScript() {
    const errorMsg = validateStudioInputs();
    if (errorMsg) {
      notify(`⚠️ ${errorMsg}`);
      return;
    }

    setIsGeneratingScript(true);
    const catLabel = selectedCategory === "Others" ? (customStoryTag || "Custom") : selectedCategory;
    notify(`🧠 Running from-scratch ML model to generate suspenseful story & scenes for ${catLabel}...`);
    try {
      // If aiPrompt matches any previously generated part script, treat it as a fresh regeneration request
      const isPriorGeneratedScript = generatedStoryParts.length > 0 &&
        generatedStoryParts.some((p) => p.script.trim() === aiPrompt.trim());
      const promptToSend = isPriorGeneratedScript ? "" : aiPrompt;

      const res = await fetch("/api/ai-video/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          customTag: customStoryTag,
          prompt: promptToSend,
          excludeId: lastFactId,
          duration: aiDuration,
          numImages: aiNumImages,
          numParts: aiNumParts,
          voice: aiVoice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to auto-generate script");
      }
      if (data.factId) {
        setLastFactId(data.factId);
      }
      const parts = Array.isArray(data.parts) ? data.parts : [];
      setGeneratedStoryParts(parts);
      setAiCurrentPart(1);
      if (parts.length > 0) {
        setAiPrompt(parts[0].script);
      }
      const titleInfo = data.overallTitle ? `"${data.overallTitle}"` : (data.numParts > 1 ? `${data.numParts} cliffhanger parts` : '1 complete story');
      notify(`✨ Generated ${titleInfo} with ${aiNumImages} scenes calibrated to ${aiDuration}s!`);
    } catch (err: any) {
      notify("Failed to generate script: " + err.message);
    } finally {
      setIsGeneratingScript(false);
    }
  }

  function handleSelectPart(partNum: number) {
    setAiCurrentPart(partNum);
    const target = generatedStoryParts.find((p) => p.partNumber === partNum);
    if (target) {
      setAiPrompt(target.script);
    }
  }

  async function handleGenerateSceneImage(sceneIndex: number, customPrompt?: string) {
    setGeneratingSceneIdx(sceneIndex);
    try {
      const targetPart = generatedStoryParts.find((p) => (p.partNumber || p.part_number) === aiCurrentPart);
      const sceneObj = targetPart?.scenes?.find((s: any) => s.scene_index === sceneIndex);
      const promptToUse = customPrompt || sceneObj?.visual_prompt || sceneObj?.text || aiPrompt;

      notify(`🎨 Generating AI visual for Scene ${sceneIndex + 1} with local PyTorch model...`);

      const res = await fetch("/api/ai-video/generate-scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToUse,
          style: selectedSceneStyle,
          aspect: "9:16 (Shorts / Reels)",
          sceneIndex,
          partNumber: aiCurrentPart,
          steps: 4,
          seed: Math.floor(Math.random() * 1000000),
          colabGpuUrl: colabGpuUrl.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate scene visual");
      }

      setGeneratedStoryParts((prevParts) =>
        prevParts.map((part) => {
          if ((part.partNumber || part.part_number) !== aiCurrentPart) return part;
          const updatedScenes = (part.scenes || []).map((scn: any) => {
            if (scn.scene_index === sceneIndex) {
              return { ...scn, imageUrl: data.imageUrl };
            }
            return scn;
          });
          return { ...part, scenes: updatedScenes };
        })
      );

      notify(`✨ Scene ${sceneIndex + 1} visual generated successfully!`);
    } catch (err: any) {
      notify(`Failed to generate visual: ${err.message}`);
    } finally {
      setGeneratingSceneIdx(null);
    }
  }

  async function handleUploadSceneImage(sceneIndex: number, file: File) {
    try {
      notify(`📁 Uploading visual for Scene ${sceneIndex + 1}...`);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sceneIndex", String(sceneIndex));

      const res = await fetch("/api/ai-video/upload-scene-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to upload scene visual");
      }

      setGeneratedStoryParts((prevParts) =>
        prevParts.map((part) => {
          if ((part.partNumber || part.part_number) !== aiCurrentPart) return part;
          const updatedScenes = (part.scenes || []).map((scn: any) => {
            if (scn.scene_index === sceneIndex) {
              return { ...scn, imageUrl: data.imageUrl };
            }
            return scn;
          });
          return { ...part, scenes: updatedScenes };
        })
      );
      notify(`✅ Scene ${sceneIndex + 1} visual attached!`);
    } catch (err: any) {
      notify(`Upload failed: ${err.message}`);
    }
  }

  async function handleGenerateAllScenes() {
    const targetPart = generatedStoryParts.find((p) => (p.partNumber || p.part_number) === aiCurrentPart);
    const scenesToGen = targetPart?.scenes || [];
    if (scenesToGen.length === 0) {
      notify("⚠️ Please generate a script or scenes first.");
      return;
    }

    setIsGeneratingAllScenes(true);
    try {
      for (let i = 0; i < scenesToGen.length; i++) {
        const scn = scenesToGen[i];
        setGeneratingSceneIdx(scn.scene_index);
        notify(`🎨 Generating Scene ${i + 1}/${scenesToGen.length} with local PyTorch model...`);

        const res = await fetch("/api/ai-video/generate-scene-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: scn.visual_prompt || scn.text,
            style: selectedSceneStyle,
            aspect: "9:16 (Shorts / Reels)",
            sceneIndex: scn.scene_index,
            partNumber: aiCurrentPart,
            steps: 4,
            seed: Math.floor(Math.random() * 1000000),
            colabGpuUrl: colabGpuUrl.trim(),
          }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.imageUrl) {
          setGeneratedStoryParts((prevParts) =>
            prevParts.map((part) => {
              if ((part.partNumber || part.part_number) !== aiCurrentPart) return part;
              const updatedScenes = (part.scenes || []).map((s: any) =>
                s.scene_index === scn.scene_index ? { ...s, imageUrl: data.imageUrl } : s
              );
              return { ...part, scenes: updatedScenes };
            })
          );
        }
      }
      notify(`✨ All ${scenesToGen.length} scene visuals generated!`);
    } catch (err: any) {
      notify(`Error generating all scenes: ${err.message}`);
    } finally {
      setIsGeneratingAllScenes(false);
      setGeneratingSceneIdx(null);
    }
  }

  async function handleGenerateAiVideo() {
    const errorMsg = validateStudioInputs();
    if (errorMsg) {
      notify(`⚠️ ${errorMsg}`);
      return;
    }

    setIsGeneratingAiVideo(true);
    setGeneratedAiVideo(null);
    setGeneratedAiVideosList([]);
    setPreviewPartIdx(0);
    setAiProgress(5);

    const totalPartsToGen = Math.max(1, Math.min(5, aiNumParts));
    const allProducedVideos: any[] = [];

    try {
      for (let pIdx = 1; pIdx <= totalPartsToGen; pIdx++) {
        // Determine script and pre-generated scene images for this part
        let partScript = aiPrompt;
        const matchingPart = generatedStoryParts.find((gp) => (gp.partNumber || gp.part_number) === pIdx);
        if (matchingPart && matchingPart.script) {
          partScript = matchingPart.script;
        }
        const partSceneImages = (matchingPart?.scenes || [])
          .map((s: any) => s.imageUrl)
          .filter(Boolean);

        const basePct = Math.round(((pIdx - 1) / totalPartsToGen) * 100);
        const nextPct = Math.round((pIdx / totalPartsToGen) * 100);
        setAiProgress(basePct + 2);
        const partLabel = totalPartsToGen > 1 ? `Part ${pIdx}/${totalPartsToGen}: ` : "";
        setAiProgressStep(`${partLabel}Generating 9:16 vertical AI scenes with PyTorch...`);

        // Interval to tick progress smoothly within the part's slice
        let partLocalPct = basePct + 2;
        const partTimer = setInterval(() => {
          partLocalPct += Math.floor(Math.random() * 3) + 1;
          if (partLocalPct > nextPct - 3) {
            partLocalPct = nextPct - 3;
          }
          setAiProgress(partLocalPct);
          const relPct = (partLocalPct - basePct) / (nextPct - basePct || 1);
          if (relPct < 0.3) {
            setAiProgressStep(`${partLabel}Generating 9:16 vertical AI scenes with PyTorch...`);
          } else if (relPct < 0.6) {
            setAiProgressStep(`${partLabel}Synthesizing neural voiceover & audio waveforms...`);
          } else if (relPct < 0.85) {
            setAiProgressStep(`${partLabel}Composing video, Ken-Burns zooms & captions...`);
          } else {
            setAiProgressStep(`${partLabel}Appending outro & finalizing MP4 encoding...`);
          }
        }, 700);

        try {
          const response = await fetch("/api/ai-video/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: selectedCategory,
              customTag: customStoryTag,
              prompt: partScript,
              script: partScript,
              voice: aiVoice,
              numImages: aiNumImages,
              duration: aiDuration,
              numParts: totalPartsToGen,
              partNumber: pIdx,
              sceneImages: partSceneImages,
              userId: auth?.currentUser?.uid || "creator",
              userEmail: auth?.currentUser?.email || "",
              colabGpuUrl: colabGpuUrl.trim(),
              stylePreset: selectedSceneStyle,
              captionStyle: selectedCaptionStyle,
            }),
          });
          clearInterval(partTimer);
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) {
            throw new Error(data.error || `Failed to generate Part ${pIdx}.`);
          }

          allProducedVideos.push(data);
          let finalData = data;
          if ((data.cloudMode === "github" || !data.clip) && data.jobId) {
            setAiProgressStep(`${partLabel}Job dispatched to GitHub Actions cloud runner...`);
            const completedClip = await new Promise<any>((resolve, reject) => {
              let pollAttempts = 0;
              const poll = setInterval(async () => {
                pollAttempts++;
                try {
                  const uid = auth?.currentUser?.uid || "creator";
                  const sRes = await fetch(`/api/viral-clips/status?jobId=${data.jobId}&userId=${encodeURIComponent(uid)}`);
                  if (sRes.ok) {
                    const job = await sRes.json();
                    if (job.step) {
                      setAiProgressStep(`${partLabel}${job.step}`);
                    }
                    if (job.progress) {
                      const scaledPct = basePct + Math.round(((job.progress / 100) * (nextPct - basePct)));
                      setAiProgress(scaledPct);
                    }
                    if (job.status === "done" && Array.isArray(job.clips) && job.clips.length > 0) {
                      clearInterval(poll);
                      resolve(job.clips[0]);
                      return;
                    } else if (job.status === "failed") {
                      clearInterval(poll);
                      reject(new Error(job.error || `Cloud generation failed for Part ${pIdx}.`));
                      return;
                    }
                  }

                  // Direct Cloudinary CDN fallback after 24s if the video has already finished uploading
                  if (pollAttempts >= 8 && data.jobId) {
                    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dbgvwyhdr";
                    const safeUid = uid.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "creator";
                    const safeJid = data.jobId.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "job";
                    const directVideoUrl = `https://res.cloudinary.com/${cloudName}/video/upload/ai_videos/${safeUid}/${safeJid}.mp4`;
                    const directThumbUrl = `https://res.cloudinary.com/${cloudName}/image/upload/ai_thumbs/${safeUid}/${safeJid}.jpg`;

                    try {
                      const headRes = await fetch(directVideoUrl, { method: "HEAD" });
                      if (headRes.ok) {
                        clearInterval(poll);
                        resolve({
                          id: data.jobId,
                          partNumber: pIdx,
                          totalParts: totalPartsToGen,
                          title: partScript ? partScript.slice(0, 50) : `Part ${pIdx}`,
                          description: partScript,
                          hashtags: ["viral", "ai", "shorts", "reels"],
                          duration: aiDuration,
                          url: directVideoUrl,
                          clipPath: directVideoUrl,
                          publicUrl: directVideoUrl,
                          videoUrl: directVideoUrl,
                          cloudinaryUrl: directVideoUrl,
                          thumbnailUrl: directThumbUrl,
                          cloudinaryPublicId: `ai_videos/${safeUid}/${safeJid}`,
                          format: selectedCategory,
                          isAiVideo: true,
                        });
                        return;
                      }
                    } catch {}
                  }
                } catch {
                  // retry polling
                }
              }, 3000);
            });

            finalData = {
              success: true,
              videoUrl: completedClip.videoUrl || completedClip.url || completedClip.clipPath,
              thumbnailUrl: completedClip.thumbnailUrl,
              title: completedClip.title,
              description: completedClip.description,
              hashtags: completedClip.hashtags,
              category: completedClip.format || selectedCategory,
              isAiVideo: true,
              partNumber: pIdx,
              totalParts: totalPartsToGen,
              duration: completedClip.duration || aiDuration,
              clip: completedClip,
            };
            allProducedVideos[allProducedVideos.length - 1] = finalData;
          }

          setGeneratedAiVideosList([...allProducedVideos]);
          if (pIdx === 1) {
            setGeneratedAiVideo(finalData);
          }

          if (finalData.clip) {
            const newRecord: VideoRecord = {
              id: finalData.clip.id,
              title: finalData.clip.title,
              description: finalData.clip.description,
              hashtags: finalData.clip.hashtags || [],
              duration: finalData.clip.duration || aiDuration,
              videoUrl: finalData.clip.videoUrl || finalData.videoUrl,
              cloudinaryUrl: finalData.clip.cloudinaryUrl || finalData.videoUrl,
              thumbnailUrl: finalData.clip.thumbnailUrl || finalData.thumbnailUrl,
              format: selectedCategory === "Others" ? (customStoryTag || "Custom") : selectedCategory,
              isAiVideo: true,
              createdAt: new Date().toISOString(),
              status: "completed",
            };
            setVideos((prev) => deduplicateVideos([[newRecord], prev]));
            const cached = JSON.parse(localStorage.getItem("tvd-studio-session-videos") || "[]") as VideoRecord[];
            localStorage.setItem("tvd-studio-session-videos", JSON.stringify(deduplicateVideos([[newRecord], cached])));
            if (database && auth?.currentUser?.uid) {
              saveVideo(auth.currentUser.uid, newRecord).catch(() => {});
            }
          }
          setAiProgress(nextPct);
        } catch (subErr: any) {
          clearInterval(partTimer);
          throw subErr;
        }
      }

      setAiProgress(100);
      setAiProgressStep(
        totalPartsToGen > 1
          ? `✅ All ${totalPartsToGen} Parts Generated Successfully with Outro!`
          : "✅ AI Video Generated Successfully with Outro!"
      );
      if (allProducedVideos.length > 0) {
        setGeneratedAiVideo(allProducedVideos[0]);
      }
      notify(
        totalPartsToGen > 1
          ? `🎉 Generated all ${totalPartsToGen} parts! Review each part and click 'Publish All' below.`
          : `🎉 AI Video generated successfully with outro!`
      );
    } catch (err: any) {
      setAiProgress(0);
      setAiProgressStep("");
      notify("AI Video generation error: " + err.message);
    } finally {
      setIsGeneratingAiVideo(false);
    }
  }

  async function handlePublishAiVideo(videoItem?: any) {
    const targetVideo = videoItem || generatedAiVideosList[previewPartIdx] || generatedAiVideo;
    if (!targetVideo || !targetVideo.clip) return;
    const activePlatforms = [];
    if (aiPlatforms.youtube) activePlatforms.push("YouTube");
    if (aiPlatforms.facebook) activePlatforms.push("Facebook");
    if (aiPlatforms.instagram) activePlatforms.push("Instagram");
    if (!activePlatforms.length) {
      notify("Select at least one social platform to publish to.");
      return;
    }
    setIsPublishingAi(true);
    try {
      const clip = targetVideo.clip;
      const res = await fetch("/api/viral-clips/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipId: clip.id,
          id: clip.id,
          clipPath: clip.videoUrl || clip.cloudinaryUrl,
          videoUrl: clip.videoUrl || clip.cloudinaryUrl,
          partNumber: clip.partNumber || 1,
          totalParts: clip.totalParts || 1,
          title: clip.title,
          description: clip.description,
          hashtags: clip.hashtags,
          platforms: activePlatforms,
          userEmail: auth?.currentUser?.email || "",
          connections,
          cloudinaryPublicId: clip.cloudinaryPublicId,
          format: clip.format || selectedCategory,
          category: clip.format || selectedCategory,
          isAiVideo: true,
          thumbnailUrl: clip.thumbnailUrl,
          duration: clip.duration || aiDuration,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Publishing failed.");
      }

      const updatedRecord: VideoRecord = {
        id: clip.id,
        title: clip.title,
        description: clip.description,
        hashtags: clip.hashtags || [],
        duration: clip.duration || aiDuration,
        videoUrl: clip.videoUrl || clip.cloudinaryUrl,
        cloudinaryUrl: clip.cloudinaryUrl,
        thumbnailUrl: clip.thumbnailUrl || data.thumbnailUrl,
        format: clip.format || selectedCategory,
        isAiVideo: true,
        createdAt: clip.createdAt || new Date().toISOString(),
        status: "completed",
        youtube: (data.youtubeUrl || data.youtubeVideoId) ? 1 : 0,
        youtubeVideoId: data.youtubeVideoId || "",
        youtubeUrl: data.youtubeUrl || "",
        facebook: (data.facebookUrl || data.facebookVideoId) ? 1 : 0,
        facebookVideoId: data.facebookVideoId || "",
        facebookUrl: data.facebookUrl || "",
        instagram: (data.instagramUrl || data.instagramVideoId) ? 1 : 0,
        instagramVideoId: data.instagramVideoId || "",
        instagramUrl: data.instagramUrl || "",
      };

      setVideos((prev) => deduplicateVideos([[updatedRecord], prev], auth?.currentUser?.uid));
      const cached = JSON.parse(localStorage.getItem("tvd-studio-session-videos") || "[]") as VideoRecord[];
      localStorage.setItem("tvd-studio-session-videos", JSON.stringify(deduplicateVideos([[updatedRecord], cached])));
      if (database && auth?.currentUser?.uid) {
        saveVideo(auth.currentUser.uid, updatedRecord).catch(() => {});
      }

      const partTag = clip.totalParts > 1 ? ` (Part ${clip.partNumber}/${clip.totalParts})` : "";
      notify(`🚀 AI Video${partTag} published successfully across selected platforms!`);
      // Redirect to library immediately just like viral clips
      setScreen("library");
    } catch (err: any) {
      notify("Publish error: " + err.message);
    } finally {
      setIsPublishingAi(false);
    }
  }

  async function handlePublishAllAiVideos() {
    const listToPublish = generatedAiVideosList.length > 0 ? generatedAiVideosList : (generatedAiVideo ? [generatedAiVideo] : []);
    if (!listToPublish.length) return;

    const activePlatforms = [];
    if (aiPlatforms.youtube) activePlatforms.push("YouTube");
    if (aiPlatforms.facebook) activePlatforms.push("Facebook");
    if (aiPlatforms.instagram) activePlatforms.push("Instagram");
    if (!activePlatforms.length) {
      notify("Select at least one social platform to publish to.");
      return;
    }

    setIsPublishingAllAi(true);
    let publishedCount = 0;
    try {
      for (let i = 0; i < listToPublish.length; i++) {
        const item = listToPublish[i];
        if (!item || !item.clip) continue;
        const clip = item.clip;
        notify(`Publishing Part ${i + 1} of ${listToPublish.length} across socials...`);
        const res = await fetch("/api/viral-clips/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clipId: clip.id,
            id: clip.id,
            clipPath: clip.videoUrl || clip.cloudinaryUrl,
            videoUrl: clip.videoUrl || clip.cloudinaryUrl,
            partNumber: clip.partNumber || (i + 1),
            totalParts: listToPublish.length,
            title: clip.title,
            description: clip.description,
            hashtags: clip.hashtags,
            platforms: activePlatforms,
            userEmail: auth?.currentUser?.email || "",
            connections,
            cloudinaryPublicId: clip.cloudinaryPublicId,
            format: clip.format || selectedCategory,
            category: clip.format || selectedCategory,
            isAiVideo: true,
            thumbnailUrl: clip.thumbnailUrl,
            duration: clip.duration || aiDuration,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          notify(`⚠️ Part ${i + 1} publishing failed: ${data.error || 'Server error'}`);
        } else {
          publishedCount++;
          const updatedRecord: VideoRecord = {
            id: clip.id,
            title: clip.title,
            description: clip.description,
            hashtags: clip.hashtags || [],
            duration: clip.duration || aiDuration,
            videoUrl: clip.videoUrl || clip.cloudinaryUrl,
            cloudinaryUrl: clip.cloudinaryUrl,
            thumbnailUrl: clip.thumbnailUrl || data.thumbnailUrl,
            format: clip.format || selectedCategory,
            isAiVideo: true,
            createdAt: clip.createdAt || new Date().toISOString(),
            status: "completed",
            youtube: (data.youtubeUrl || data.youtubeVideoId) ? 1 : 0,
            youtubeVideoId: data.youtubeVideoId || "",
            youtubeUrl: data.youtubeUrl || "",
            facebook: (data.facebookUrl || data.facebookVideoId) ? 1 : 0,
            facebookVideoId: data.facebookVideoId || "",
            facebookUrl: data.facebookUrl || "",
            instagram: (data.instagramUrl || data.instagramVideoId) ? 1 : 0,
            instagramVideoId: data.instagramVideoId || "",
            instagramUrl: data.instagramUrl || "",
          };
          setVideos((prev) => deduplicateVideos([[updatedRecord], prev], auth?.currentUser?.uid));
          const cached = JSON.parse(localStorage.getItem("tvd-studio-session-videos") || "[]") as VideoRecord[];
          localStorage.setItem("tvd-studio-session-videos", JSON.stringify(deduplicateVideos([[updatedRecord], cached])));
          if (database && auth?.currentUser?.uid) {
            saveVideo(auth.currentUser.uid, updatedRecord).catch(() => {});
          }
        }
      }
      notify(`🎉 Successfully published ${publishedCount} of ${listToPublish.length} parts across socials!`);
      // Redirect to library view upon publishing all parts
      setScreen("library");
    } catch (err: any) {
      notify("Publish all error: " + err.message);
    } finally {
      setIsPublishingAllAi(false);
    }
  }

  async function updateCronSelectionMode(mode: "random" | "chosen") {
    setCronSelectionMode(mode);
    try {
      localStorage.setItem("tvd-cron-selection-mode", mode);
      if (database) {
        await setDoc(doc(database, "app_config", "auto_pilot"), {
          cronSelectionMode: mode,
          chosenCategory: selectedCategory,
          chosenVoice: aiVoice,
          chosenParts: aiNumParts,
          chosenDuration: aiDuration,
          chosenCaption: selectedCaptionStyle,
          chosenSceneStyle: selectedSceneStyle,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err) {}
    notify(`Auto-Pilot Content Selection set to: ${mode === "random" ? "Random Video Types (Random Category, Voice, Style, Parts)" : "Chosen Type Only (Chosen Category, Voice, Style, Parts)"}`);
  }

  async function updateCronContentType(type: "viral" | "ai" | "both") {
    setCronContentType(type);
    try {
      localStorage.setItem("tvd-cron-content-type", type);
      if (database) {
        await setDoc(doc(database, "app_config", "auto_pilot"), { contentType: type, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (err) {}
    notify(`Cron Content Mode set to: ${type === "viral" ? "Viral Reels Only" : type === "ai" ? "AI Story Only" : "Both (Alternating)"}`);
  }

  async function handleRepostPlatform(video: VideoRecord, platform: "YouTube" | "Facebook" | "Instagram") {
    const key = `${video.id}-${platform}`;
    if (repostingKey) return;
    setRepostingKey(key);

    try {
      const vidUrl = video.cloudinaryUrl || video.videoUrl || "";
      if (!vidUrl) {
        throw new Error("No video file URL found for this clip.");
      }

      notify(`Publishing to ${platform}...`);
      const res = await fetch("/api/viral-clips/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipId: video.id,
          clipPath: vidUrl,
          partNumber: video.partNumber || 1,
          totalParts: video.totalParts || 1,
          title: video.title,
          description: video.description || "",
          hashtags: Array.isArray(video.hashtags) ? video.hashtags : [],
          platforms: [platform],
          userEmail: auth?.currentUser?.email || "",
          userId: auth?.currentUser?.uid || video.userId || "creator",
          connections: [platform],
          cloudinaryPublicId: video.cloudinaryPublicId,
          cloudinaryUrl: video.cloudinaryUrl,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          format: video.format,
          category: video.format,
          isAiVideo: Boolean(video.isAiVideo),
          createdAt: video.createdAt,
          youtube: video.youtube,
          youtubeVideoId: video.youtubeVideoId,
          youtubeUrl: video.youtubeUrl,
          facebook: video.facebook,
          facebookVideoId: video.facebookVideoId,
          facebookUrl: video.facebookUrl,
          instagram: video.instagram,
          instagramVideoId: video.instagramVideoId,
          instagramUrl: video.instagramUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || (!data.success && !data.youtubeVideoId && !data.facebookVideoId && !data.instagramVideoId)) {
        throw new Error(data.error || `Failed to post to ${platform}.`);
      }

      setVideos((prev) =>
        prev.map((v) => {
          if (v.id === video.id) {
            const updated: VideoRecord = { ...v };
            if (platform === "YouTube" && (data.youtubeUrl || data.youtubeVideoId)) {
              updated.youtube = 1;
              updated.youtubeVideoId = data.youtubeVideoId || v.youtubeVideoId;
              updated.youtubeUrl = data.youtubeUrl || (data.youtubeVideoId ? `https://www.youtube.com/shorts/${data.youtubeVideoId}` : v.youtubeUrl);
            }
            if (platform === "Facebook" && (data.facebookUrl || data.facebookVideoId)) {
              updated.facebook = 1;
              updated.facebookVideoId = data.facebookVideoId || v.facebookVideoId;
              updated.facebookUrl = data.facebookUrl || (data.facebookVideoId ? `https://www.facebook.com/reel/${data.facebookVideoId}` : v.facebookUrl);
            }
            if (platform === "Instagram" && (data.instagramUrl || data.instagramVideoId)) {
              updated.instagram = 1;
              updated.instagramVideoId = data.instagramVideoId || v.instagramVideoId;
              updated.instagramUrl = data.instagramUrl || (data.instagramVideoId ? `https://www.instagram.com/reel/${data.instagramVideoId}` : v.instagramUrl);
            }
            return updated;
          }
          return v;
        })
      );

      notify(`🎉 Successfully published to ${platform}!`);
    } catch (err: any) {
      notify(`❌ ${platform} error: ${err.message}`);
    } finally {
      setRepostingKey(null);
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
        format: existingRecord?.isAiVideo ? (existingRecord?.format || "AI Video") : "Viral",
        sourceUrl: videoUrl || existingRecord?.sourceUrl || existingRecord?.sourceLink || "",
        sourceLink: videoUrl || existingRecord?.sourceLink || existingRecord?.sourceUrl || "",
        isCron: Boolean(existingRecord?.isCron || (existingRecord?.id && String(existingRecord.id).includes("cron"))),
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
      // Clean up Cloudinary assets for all cleared videos
      for (const v of videos) {
        if (v.cloudinaryPublicId || v.cloudinaryUrl || v.videoUrl?.includes("res.cloudinary.com")) {
          deleteFromCloudinary({
            cloudinaryPublicId: v.cloudinaryPublicId,
            cloudinaryUrl: v.cloudinaryUrl,
            videoUrl: v.videoUrl,
            thumbnailUrl: v.thumbnailUrl,
          }).catch(() => {});
        }
      }
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
    const headers = ["Title", "Description", "Captions", "Hashtags", "Video URL", "Source Link", "Format", "Created"];
    const rows = videos.map((video) => [
      video.title,
      video.description,
      video.captions,
      video.hashtags.join(" "),
      video.videoUrl,
      video.sourceUrl || video.sourceLink || "",
      video.format,
      video.createdAt,
    ]);
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
      // 1. Delete video & thumbnail assets from Cloudinary immediately
      await deleteFromCloudinary({
        cloudinaryPublicId: target.cloudinaryPublicId,
        cloudinaryUrl: target.cloudinaryUrl,
        videoUrl: target.videoUrl,
        thumbnailUrl: target.thumbnailUrl,
      }).catch((e) => console.warn("Cloudinary delete notice:", e.message));

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
      } else {
        if (database) {
          deleteDoc(doc(database, "videos", target.id)).catch(() => {});
        }
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
    let matchesFormat = true;
    if (filter === "All videos") {
      matchesFormat = true;
    } else if (filter === "Viral") {
      matchesFormat = !video.isAiVideo || video.format === "Viral";
    } else if (filter === "AI Videos") {
      matchesFormat = Boolean(video.isAiVideo);
    } else {
      matchesFormat = video.format === filter;
    }
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
        <div className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> THE VIRAL DESK STUDIO</div>
            <h1>{studioMode === "viral" ? <>Turn viral videos into <em>your content.</em></> : <>Generate &amp; post <em>AI videos.</em></>}</h1>
            <p>{studioMode === "viral" ? "Paste a viral video URL or auto-find trending videos, split it into clips, auto-generate descriptions & hashtags, and post — all free." : "Create viral vertical videos from scratch using ONNX ML models trained on 10,500+ trending videos with neural voiceover, animated captions, and one-click publishing."}</p>
          </div>
          <button className="secondary-button export-button" onClick={exportCsv}><ArrowDownToLine size={16} /> Export spreadsheet</button>
        </div>

        {/* Studio Mode Selector: Scrape Viral Videos vs Post AI Videos */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setStudioMode("viral")}
            className={`pill-btn ${studioMode === "viral" ? "active-scrape" : ""}`}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', cursor: 'pointer' }}
          >
            <Scissors size={15} /> 🎬 Scrape Viral Videos
          </button>
          <button
            type="button"
            onClick={() => setStudioMode("ai")}
            className={`pill-btn ${studioMode === "ai" ? "active-ai" : ""}`}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', cursor: 'pointer' }}
          >
            <Sparkles size={15} /> 🤖 Post AI Videos (ML Engine)
          </button>
        </div>

        <div className="creator-layout">
          <div className="creator-form">
            {studioMode === "ai" && (
              <div className="form-section">
                <div className="section-title"><span className="step-number">01</span><div><h2>Choose content category</h2><p>Select a story genre or untold interesting facts for the ML model to generate.</p></div></div>
                <div className="format-grid">{formats.map(({ name, icon: Icon, tone, detail }) => (
                  <button
                    key={name}
                    onClick={() => {
                      setSelectedCategory(name);
                    }}
                    className={`format-option ${selectedCategory === name ? "selected" : ""}`}
                  >
                    <span className={`format-icon ${tone}`}><Icon size={18} /></span>
                    <span className="format-copy"><strong>{name}</strong><small>{detail}</small></span>
                    {selectedCategory === name && <Check className="format-check" size={16} />}
                  </button>
                ))}
                </div>

                {/* Custom Story Tag Input if "Others" is selected */}
                {selectedCategory === "Others" && (
                  <div style={{ marginTop: '14px', background: '#12141c', padding: '14px 16px', borderRadius: '10px', border: '1px solid #1e2230' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                      Custom Story Tag / Theme: <span style={{ color: '#ec4899' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={customStoryTag}
                      onChange={(e) => setCustomStoryTag(e.target.value)}
                      placeholder="e.g. Cyberpunk detective mystery, Secret subterranean bunker, Ancient mythological curse..."
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: '#0e1017',
                        border: '1px solid #272a38',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                      Describe your custom story universe or theme. The ML model will construct custom visual scenes and cliffhanger suspense for this specific theme.
                    </p>
                  </div>
                )}
              </div>
            )}

            {studioMode === "ai" && (
              <div className="form-section">
                <div className="section-title">
                  <span className="step-number">02</span>
                  <div>
                    <h2>Choose Visual Character &amp; Art Style</h2>
                    <p>Select your scene picture style first. The AI script engine matches the story directly to your chosen aesthetic (e.g. Mecha for futuristic robot wars, Dark Fantasy for armored knights &amp; ruins).</p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
                    gap: '10px',
                    marginTop: '12px',
                  }}
                >
                  {[
                    {
                      id: "Realism",
                      name: "Realism",
                      character: "Photoreal Human",
                      image: "/assets/styles/realism.jpg",
                      badge: "8K Photoreal",
                      desc: "Cinematic human portrait, lifelike skin & eyes, 35mm lens.",
                      accent: "#f97316",
                      bg: "rgba(249, 115, 22, 0.08)",
                    },
                    {
                      id: "Anime",
                      name: "Anime",
                      character: "Anime Hero",
                      image: "/assets/styles/anime.jpg",
                      badge: "Ghibli / Shinkai",
                      desc: "Expressive Japanese anime features, rich glow, crisp lines.",
                      accent: "#ec4899",
                      bg: "rgba(236, 72, 153, 0.08)",
                    },
                    {
                      id: "Disney 3D",
                      name: "Disney 3D",
                      character: "Pixar 3D Person",
                      image: "/assets/styles/disney3d.jpg",
                      badge: "Pixar 3D",
                      desc: "Charming animated face, warm 3D studio subsurface glow.",
                      accent: "#a855f7",
                      bg: "rgba(168, 85, 247, 0.08)",
                    },
                    {
                      id: "Mecha",
                      name: "Mecha",
                      character: "Cyber Warrior",
                      image: "/assets/styles/mecha.jpg",
                      badge: "Sci-Fi Cyborg",
                      desc: "Glowing exoskeleton armor, cyber helmet, neon reflections.",
                      accent: "#06b6d4",
                      bg: "rgba(6, 182, 212, 0.08)",
                    },
                    {
                      id: "Dark Fantasy",
                      name: "Dark Fantasy",
                      character: "Armored Knight",
                      image: "/assets/styles/darkfantasy.jpg",
                      badge: "Elden / Witcher",
                      desc: "Steel plate armor, mystical runes, atmospheric mist.",
                      accent: "#ef4444",
                      bg: "rgba(239, 68, 68, 0.08)",
                    },
                    {
                      id: "Retro Comic",
                      name: "Retro Comic",
                      character: "Comic Superhero",
                      image: "/assets/styles/retrocomic.jpg",
                      badge: "Pop-Art Ink",
                      desc: "Bold ink contours, pop-art halftone dots, vintage cover.",
                      accent: "#eab308",
                      bg: "rgba(234, 179, 8, 0.08)",
                    },
                  ].map((styleCard) => {
                    const isSelected = selectedSceneStyle.toLowerCase() === styleCard.id.toLowerCase();
                    return (
                      <div
                        key={styleCard.id}
                        onClick={() => setSelectedSceneStyle(styleCard.id)}
                        style={{
                          background: isSelected ? styleCard.bg : '#141722',
                          border: `1.5px solid ${isSelected ? styleCard.accent : '#25293a'}`,
                          borderRadius: '12px',
                          padding: '10px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                          boxShadow: isSelected ? `0 0 16px ${styleCard.accent}44` : 'none',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Real AI Generated Character Image Preview */}
                        <div
                          style={{
                            width: '100%',
                            height: '110px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            position: 'relative',
                            border: `1px solid ${isSelected ? styleCard.accent : '#25293a'}`,
                            background: '#0d0f17',
                          }}
                        >
                          <img
                            src={styleCard.image}
                            alt={styleCard.character}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                              transition: 'transform 0.3s ease',
                            }}
                          />
                          {isSelected && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '6px',
                                right: '6px',
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: styleCard.accent,
                                color: '#000',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 800,
                                boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                              }}
                            >
                              ✓
                            </div>
                          )}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '4px',
                              left: '6px',
                              background: 'rgba(0,0,0,0.75)',
                              backdropFilter: 'blur(4px)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              fontWeight: 700,
                              color: styleCard.accent,
                              border: `1px solid ${styleCard.accent}55`,
                            }}
                          >
                            AI STYLE
                          </div>
                        </div>

                        {/* Style Details */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                              {styleCard.name}
                            </div>
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                color: isSelected ? '#ffffff' : '#64748b',
                                background: isSelected ? `${styleCard.accent}33` : '#181b26',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {styleCard.badge}
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: styleCard.accent, fontWeight: 600, marginTop: '2px' }}>
                            {styleCard.character}
                          </div>
                        </div>

                        <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0', lineHeight: '1.3' }}>
                          {styleCard.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {studioMode === "ai" && (
              <div className="form-section brief-section">
                <div className="section-title"><span className="step-number">03</span><div><h2>Customize AI video &amp; generate</h2><p>Generate cliffhanger scripts, configure narration voice, scene backdrops, duration timer, and multi-part series.</p></div></div>
                <div style={{ position: 'relative', marginTop: '8px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                  
                  {/* AI Narrator Selection with 6 Person Cards */}
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🎙️</span> AI Narrator Voice (6 Person Personas):
                      </span>
                      <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 500 }}>
                        Click speaker icon to listen to 100% matched sample
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {[
                        {
                          id: "en-US-ChristopherNeural",
                          name: "Christopher",
                          avatar: "🧔",
                          role: "Deep Cinematic Male",
                          accent: "US English",
                          badge: "Viral Movie Trailer",
                          accentColor: "#38bdf8",
                        },
                        {
                          id: "en-US-JennyNeural",
                          name: "Jenny",
                          avatar: "👩",
                          role: "Warm Storyteller Female",
                          accent: "US English",
                          badge: "Top Conversational",
                          accentColor: "#ec4899",
                        },
                        {
                          id: "en-US-GuyNeural",
                          name: "Guy",
                          avatar: "⚡",
                          role: "High-Energy Viral Male",
                          accent: "US English",
                          badge: "Shorts & Reels",
                          accentColor: "#eab308",
                        },
                        {
                          id: "en-US-AriaNeural",
                          name: "Aria",
                          avatar: "🔬",
                          role: "Documentary Female",
                          accent: "US English",
                          badge: "Nature & Science",
                          accentColor: "#10b981",
                        },
                        {
                          id: "en-US-BrianNeural",
                          name: "Brian",
                          avatar: "🎩",
                          role: "British Narrator Male",
                          accent: "UK English",
                          badge: "Classic Mystery",
                          accentColor: "#8b5cf6",
                        },
                        {
                          id: "en-US-EmmaNeural",
                          name: "Emma",
                          avatar: "✨",
                          role: "Youth & Expressive Female",
                          accent: "UK English",
                          badge: "Fantasy & Upbeat",
                          accentColor: "#f43f5e",
                        },
                      ].map((v) => {
                        const isSelected = aiVoice === v.id;
                        const isPlaying = playingVoiceId === v.id;
                        return (
                          <div
                            key={v.id}
                            onClick={() => setAiVoice(v.id)}
                            style={{
                              background: isSelected ? 'rgba(56, 189, 248, 0.10)' : '#141722',
                              border: `1.5px solid ${isSelected ? v.accentColor : '#25293a'}`,
                              borderRadius: '10px',
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              transition: 'all 0.2s ease',
                              boxShadow: isSelected ? `0 0 14px ${v.accentColor}33` : 'none',
                              position: 'relative',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: isSelected ? `${v.accentColor}25` : '#1e2230',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '18px',
                                    border: `1px solid ${isSelected ? v.accentColor : '#33384c'}`,
                                  }}
                                >
                                  {v.avatar}
                                </div>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                                    {v.name}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                    {v.accent}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                title={isPlaying ? "Stop sample voice" : "Listen to sample voice"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playSampleVoice(v.id);
                                }}
                                style={{
                                  background: isPlaying ? v.accentColor : '#232733',
                                  border: 'none',
                                  color: isPlaying ? '#000' : v.accentColor,
                                  borderRadius: '50%',
                                  width: '28px',
                                  height: '28px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  boxShadow: isPlaying ? `0 0 10px ${v.accentColor}` : 'none',
                                }}
                              >
                                {isPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
                              </button>
                            </div>

                            <div style={{ fontSize: '11px', color: v.accentColor, fontWeight: 600 }}>
                              {v.role}
                            </div>

                            <div style={{ marginTop: 'auto', paddingTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: isSelected ? '#ffffff' : '#64748b',
                                  background: isSelected ? `${v.accentColor}33` : '#181b26',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {v.badge}
                              </span>
                              {isSelected && (
                                <span style={{ fontSize: '10px', color: v.accentColor, fontWeight: 800 }}>
                                  ✓ Selected
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Caption Style Selector Cards */}
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>💬</span> Caption Subtitle Style:
                      </span>
                      <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 500 }}>
                        Auto-wrapped • Zero screen shadow • Never cut off
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {[
                        {
                          id: "viral_yellow",
                          name: "Viral Yellow",
                          previewText: "VIRAL HOOK",
                          textColor: "#eab308",
                          textStroke: "2px #000000",
                          boxBg: "transparent",
                          badge: "Zero Shadow",
                          desc: "Bold yellow text with black outline. No background box.",
                          accent: "#eab308",
                        },
                        {
                          id: "clean_pill",
                          name: "Clean Pill",
                          previewText: "CLEAN PILL",
                          textColor: "#ffffff",
                          textStroke: "none",
                          boxBg: "rgba(0,0,0,0.85)",
                          badge: "Snug Text Pill",
                          desc: "Crisp white text in a snug rounded pill covering only words.",
                          accent: "#38bdf8",
                        },
                        {
                          id: "cinematic",
                          name: "Cinematic",
                          previewText: "CINEMATIC",
                          textColor: "#f1f5f9",
                          textStroke: "1px #000000",
                          boxBg: "transparent",
                          badge: "Zero Box",
                          desc: "Subtle film subtitle with soft drop shadow. Zero box.",
                          accent: "#e2e8f0",
                        },
                        {
                          id: "neon_glow",
                          name: "Neon Glow",
                          previewText: "NEON CYBORG",
                          textColor: "#00f5ff",
                          textStroke: "2px #000000",
                          boxBg: "transparent",
                          badge: "Cyber Cyan",
                          desc: "Glowing cyan text with deep contrast border.",
                          accent: "#00f5ff",
                        },
                        {
                          id: "soft_shadow_bar",
                          name: "Soft Text Bar",
                          previewText: "SUBTLE BAR",
                          textColor: "#ffffff",
                          textStroke: "none",
                          boxBg: "rgba(0,0,0,0.55)",
                          badge: "Text Backing",
                          desc: "Translucent soft bar hugging only the caption line.",
                          accent: "#a855f7",
                        },
                      ].map((cStyle) => {
                        const isSelected = selectedCaptionStyle === cStyle.id;
                        return (
                          <div
                            key={cStyle.id}
                            onClick={() => setSelectedCaptionStyle(cStyle.id)}
                            style={{
                              background: isSelected ? 'rgba(56, 189, 248, 0.08)' : '#141722',
                              border: `1.5px solid ${isSelected ? cStyle.accent : '#25293a'}`,
                              borderRadius: '10px',
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              transition: 'all 0.2s ease',
                              boxShadow: isSelected ? `0 0 14px ${cStyle.accent}33` : 'none',
                              position: 'relative',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                                {cStyle.name}
                              </div>
                              {isSelected && (
                                <div
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: cStyle.accent,
                                    color: '#000',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                  }}
                                >
                                  ✓
                                </div>
                              )}
                            </div>

                            {/* Caption Visual Mini Preview */}
                            <div
                              style={{
                                height: '38px',
                                background: '#0a0c12',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid #1a1e2b',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  color: cStyle.textColor,
                                  textShadow: cStyle.textStroke !== 'none' ? '0 1px 2px #000, 0 0 1px #000' : 'none',
                                  background: cStyle.boxBg,
                                  padding: cStyle.boxBg !== 'transparent' ? '3px 8px' : '0',
                                  borderRadius: '4px',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {cStyle.previewText}
                              </span>
                            </div>

                            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0', lineHeight: '1.3' }}>
                              {cStyle.desc}
                            </p>

                            <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: isSelected ? '#ffffff' : '#64748b',
                                  background: isSelected ? `${cStyle.accent}33` : '#181b26',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {cStyle.badge}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Multi-Part Counter, Scene Count, and Duration Slider Controls */}
                  <div style={{ marginTop: '16px', background: '#12141c', padding: '14px 16px', borderRadius: '10px', border: '1px solid #1e2230' }}>
                    
                    {/* Top Row: Number of Parts & Scene Count */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                      {/* Number of Parts (1 to 5, default 1) */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Number of Parts:</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ec4899', background: 'rgba(236,72,153,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                            {aiNumParts === 1 ? '1 Part (Standalone)' : `${aiNumParts} Parts (Series)`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                setAiNumParts(n);
                                if (aiCurrentPart > n) setAiCurrentPart(1);
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 0',
                                borderRadius: '6px',
                                border: `1px solid ${aiNumParts === n ? '#ec4899' : '#2a2e3d'}`,
                                background: aiNumParts === n ? '#db2777' : '#181b24',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          {aiNumParts === 1 ? "1 part = standalone video (no 'Part 1' in title/description)." : "Cliffhangers on each part; resolved only at final part."}
                        </p>
                      </div>

                      {/* Scene Count 1 to 20 */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>AI Scene Images (1 to 20):</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                            {aiNumImages} {aiNumImages === 1 ? 'Scene' : 'Scenes'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                          {[1, 3, 5, 8, 12, 16, 20].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAiNumImages(n)}
                              style={{
                                flex: 1,
                                padding: '5px 0',
                                borderRadius: '6px',
                                border: `1px solid ${aiNumImages === n ? '#38bdf8' : '#2a2e3d'}`,
                                background: aiNumImages === n ? '#0284c7' : '#181b24',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={1}
                          value={aiNumImages}
                          onChange={(e) => setAiNumImages(Number(e.target.value))}
                          style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8', display: 'block' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                          <span>1 image</span>
                          <span>10 images</span>
                          <span>20 images</span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Generates up to 20 unique scene visuals per part matching your story.</p>
                      </div>
                    </div>

                    {/* Timer Slider 1 min (60s) to 10 mins (600s) - Full Length Width */}
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #1e2230', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Video Duration (1 to 10 Minutes):</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                          ⏱️ {Math.floor(aiDuration / 60)}m {aiDuration % 60 ? `${aiDuration % 60}s` : '0s'} ({aiDuration}s)
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        {[
                          { sec: 60, label: "1 min" },
                          { sec: 120, label: "2 mins" },
                          { sec: 180, label: "3 mins" },
                          { sec: 300, label: "5 mins" },
                          { sec: 420, label: "7 mins" },
                          { sec: 600, label: "10 mins" },
                        ].map((d) => (
                          <button
                            key={d.sec}
                            type="button"
                            onClick={() => setAiDuration(d.sec)}
                            style={{
                              flex: 1,
                              padding: '5px 0',
                              borderRadius: '6px',
                              border: `1px solid ${aiDuration === d.sec ? '#a855f7' : '#2a2e3d'}`,
                              background: aiDuration === d.sec ? 'rgba(168,85,247,0.3)' : '#181b24',
                              color: aiDuration === d.sec ? '#f3e8ff' : '#cbd5e1',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={600}
                        step={15}
                        value={aiDuration}
                        onChange={(e) => setAiDuration(Number(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer', accentColor: '#a855f7', display: 'block' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                        <span>1 min (60s)</span>
                        <span>3 mins (180s)</span>
                        <span>5 mins (300s)</span>
                        <span>10 mins (600s - Epic)</span>
                      </div>
                    </div>

                    {/* Live Colab GPU Bridge URL for Custom SDXL Model */}
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #1e2230', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          ⚡ Custom SDXL Model (Google Colab GPU Bridge):
                        </span>
                        <span style={{ fontSize: '11px', color: colabGpuUrl ? '#10b981' : '#f59e0b', fontWeight: 600, background: colabGpuUrl ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                          {colabGpuUrl ? '🟢 Colab Tesla T4 GPU Connected' : '🟡 Colab GPU Disconnected'}
                        </span>
                      </div>
                      <input
                        type="url"
                        placeholder="https://...trycloudflare.com (Paste URL from Cell 9 in Google Colab)"
                        value={colabGpuUrl}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setColabGpuUrl(val);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("colab_gpu_bridge_url", val);
                          }
                        }}
                        style={{
                          width: '100%',
                          background: '#0d1117',
                          border: `1px solid ${colabGpuUrl ? 'rgba(16,185,129,0.6)' : 'rgba(245,158,11,0.4)'}`,
                          borderRadius: '6px',
                          padding: '8px 10px',
                          fontSize: '12px',
                          color: '#f8fafc',
                          fontFamily: 'monospace',
                        }}
                      />
                      <p style={{ fontSize: '11px', color: colabGpuUrl ? '#10b981' : '#94a3b8', marginTop: '5px', lineHeight: 1.4 }}>
                        {colabGpuUrl
                          ? "✅ Active! Your live website will now synthesize all scenes in 2–3s using your custom trained SDXL LoRA on Google Colab."
                          : "💡 Your ML model is trained on SDXL (6.6 GB), which runs on Google Colab's Tesla T4 GPU. Run Cell 9 in your Colab notebook and paste the trycloudflare.com URL above, or use '📁 Upload Colab Scene' on the scene cards below."}
                      </p>
                    </div>
                  </div>

                  {/* Script Textarea & Auto-Generate Button Header */}
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>
                      {`Script & Scene Prompts ${aiNumParts > 1 ? `(Part ${aiCurrentPart} of ${aiNumParts})` : ''}:`}
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoGenerateScript}
                      disabled={isGeneratingScript || isGeneratingAiVideo}
                      style={{
                        background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                        border: '1px solid #c084fc',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: isGeneratingScript ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 10px rgba(139,92,246,0.3)',
                      }}
                    >
                      {isGeneratingScript ? (
                        <LoaderCircle className="spin" size={13} />
                      ) : generatedStoryParts.length > 0 ? (
                        <RefreshCw size={13} />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {isGeneratingScript
                        ? 'Writing suspenseful script with ML...'
                        : generatedStoryParts.length > 0
                        ? '🔄 Regenerate Another Script & Scenes'
                        : '✨ Auto-Generate Script & Scenes'}
                    </button>
                  </div>

                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={5}
                    placeholder={
                      selectedCategory === "Interesting Facts"
                        ? "Click '✨ Auto-Generate Script & Scenes' to fetch untold real-world historical and marketing facts (e.g. Tobacco PR revolution, Graham Bell's Hello origin, De Beers diamond monopoly)... or enter your custom fact."
                        : `Enter your custom script & scenes, or click '✨ Auto-Generate Script & Scenes' for an AI suspense story customized for ${selectedCategory === "Others" ? (customStoryTag || "your theme") : selectedCategory}...`
                    }
                    className="video-url-input"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: '#0e1017',
                      border: '1px solid #272a38',
                      color: '#fff',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />

                  {/* Multi-part tabs if parts have been generated */}
                  {generatedStoryParts.length > 1 && (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>Switch Generated Part:</span>
                      {generatedStoryParts.map((p) => {
                        const pNum = p.partNumber || p.part_number;
                        const isSelected = aiCurrentPart === pNum;
                        return (
                          <button
                            key={pNum}
                            type="button"
                            onClick={() => handleSelectPart(pNum)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: `1px solid ${isSelected ? '#ec4899' : '#272a38'}`,
                              background: isSelected ? 'rgba(236,72,153,0.2)' : '#161922',
                              color: isSelected ? '#f472b6' : '#cbd5e1',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Part {pNum}{p.isLastPart || p.is_final ? ' (Finale)' : ' (Cliffhanger)'}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Local AI Scene Visuals Gallery (Interactive Scene-by-Scene Display) */}
                  {(() => {
                    const activePart = generatedStoryParts.find((p) => (p.partNumber || p.part_number) === aiCurrentPart);
                    const scenesList = activePart?.scenes || [];

                    if (scenesList.length === 0) {
                      return (
                        <div
                          style={{
                            marginTop: '12px',
                            background: '#12151e',
                            border: '1px dashed #242c3d',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px' }}>🎨</span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              <strong style={{ color: '#e2e8f0' }}>Local AI Scene Generator Ready:</strong> Auto-generate a script above to preview and synthesize 9:16 vertical AI scene visuals directly on your PC.
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: '#10b981',
                              background: 'rgba(16,185,129,0.12)',
                              border: '1px solid rgba(16,185,129,0.25)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            PyTorch Diffusion Warm
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        style={{
                          marginTop: '16px',
                          background: 'linear-gradient(180deg, #10131d 0%, #0d0f17 100%)',
                          border: '1px solid #1e293b',
                          borderRadius: '12px',
                          padding: '16px',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                        }}
                      >
                        {/* Header bar */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            marginBottom: '14px',
                            paddingBottom: '12px',
                            borderBottom: '1px solid #1e2230',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '15px' }}>🎨</span>
                              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                                AI Story Scene Visuals
                              </h4>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#10b981',
                                  background: 'rgba(16,185,129,0.15)',
                                  border: '1px solid rgba(16,185,129,0.3)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                100% Local PyTorch
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                              Authentic 9:16 vertical AI scenes generated directly on your PC. No third-party API keys required.
                            </p>
                          </div>
                        </div>

                        {/* Scenes Grid */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`,
                            gap: '12px',
                          }}
                        >
                          {scenesList.map((scene: any, sIdx: number) => {
                            const isThisGenerating = generatingSceneIdx === scene.scene_index;
                            const hasImage = Boolean(scene.imageUrl);

                            return (
                              <div
                                key={scene.scene_index ?? sIdx}
                                style={{
                                  background: '#141721',
                                  border: `1px solid ${hasImage ? '#38bdf8' : '#1e293b'}`,
                                  borderRadius: '8px',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  transition: 'border-color 0.2s',
                                }}
                              >
                                {/* Scene Header */}
                                <div
                                  style={{
                                    padding: '8px 10px',
                                    background: '#181c28',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderBottom: '1px solid #242938',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                                      ⏱️ ~{Math.round(aiDuration / scenesList.length)}s
                                    </span>
                                  </div>
                                  {hasImage && (
                                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#10b981' }}>
                                      ✓ Ready
                                    </span>
                                  )}
                                </div>

                                {/* Image Preview Area */}
                                <div
                                  style={{
                                    height: '240px',
                                    position: 'relative',
                                    background: '#090b10',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {hasImage ? (
                                    <img
                                      src={scene.imageUrl}
                                      alt={`Scene ${sIdx + 1}`}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        display: 'block',
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => window.open(scene.imageUrl, '_blank')}
                                      title="Click to view full resolution"
                                    />
                                  ) : isThisGenerating ? (
                                    <div
                                      style={{
                                        textAlign: 'center',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px',
                                      }}
                                    >
                                      <LoaderCircle className="spin" size={24} style={{ color: '#38bdf8' }} />
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                                        Synthesizing with PyTorch...
                                      </span>
                                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                                        DPM-Solver 4-step diffusion on CPU
                                      </span>
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        textAlign: 'center',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '6px',
                                      }}
                                    >
                                      <span style={{ fontSize: '24px', opacity: 0.7 }}>🖼️</span>
                                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        No visual synthesized yet
                                      </span>
                                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleGenerateSceneImage(scene.scene_index)}
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            background: 'rgba(56,189,248,0.15)',
                                            border: '1px solid #0284c7',
                                            color: '#38bdf8',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          ✨ Generate Visual
                                        </button>
                                        <label
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            background: 'rgba(99,102,241,0.15)',
                                            border: '1px solid #6366f1',
                                            color: '#a5b4fc',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                          }}
                                          title="Upload scene image generated in Google Colab (e.g. scene_1.png)"
                                        >
                                          📁 Upload Colab Scene
                                          <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) handleUploadSceneImage(scene.scene_index, file);
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  )}

                                  {hasImage && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        bottom: '8px',
                                        right: '8px',
                                        display: 'flex',
                                        gap: '4px',
                                      }}
                                    >
                                      <label
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          background: 'rgba(15,23,42,0.85)',
                                          border: '1px solid #334155',
                                          color: '#e2e8f0',
                                          fontSize: '10px',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          backdropFilter: 'blur(4px)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                        }}
                                        title="Upload replacement image from Colab"
                                      >
                                        📁 Upload
                                        <input
                                          type="file"
                                          accept="image/*"
                                          style={{ display: 'none' }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUploadSceneImage(scene.scene_index, file);
                                          }}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => handleGenerateSceneImage(scene.scene_index)}
                                        disabled={isThisGenerating}
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          background: 'rgba(15,23,42,0.85)',
                                          border: '1px solid #334155',
                                          color: '#e2e8f0',
                                          fontSize: '10px',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          backdropFilter: 'blur(4px)',
                                        }}
                                        title="Regenerate this visual"
                                      >
                                        🔄 Re-roll
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Script excerpt & visual prompt */}
                                <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                                    <strong style={{ color: '#94a3b8' }}>Script: </strong>
                                    {scene.text || "Scene narration segment."}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic', lineHeight: '1.3' }}>
                                    <strong style={{ color: '#475569', fontStyle: 'normal' }}>Prompt: </strong>
                                    {scene.visual_prompt || "Vertical cinematic atmospheric scene."}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Generate Button */}
                  <div style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleGenerateAiVideo}
                      disabled={isGeneratingAiVideo}
                      style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', borderColor: '#38bdf8', padding: '10px 20px', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      {isGeneratingAiVideo ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                      {isGeneratingAiVideo
                        ? 'Running local ML model & synthesizing video...'
                        : aiNumParts > 1
                        ? `✨ Generate AI Video (Part ${aiCurrentPart} of ${aiNumParts})`
                        : `✨ Generate AI Video for ${selectedCategory === "Others" ? (customStoryTag || "Custom") : selectedCategory}`}
                    </button>
                  </div>

                  {isGeneratingAiVideo && (
                    <div style={{ marginTop: '16px', padding: '16px 18px', background: '#111218', borderRadius: '12px', border: '1px solid rgba(14,165,233,0.35)', boxShadow: '0 4px 24px rgba(0,0,0,0.45)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>
                          <LoaderCircle className="spin" size={16} />
                          <span>{aiProgressStep || "Generating AI video with local ML models..."}</span>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '3px 10px', borderRadius: '6px' }}>
                          {aiProgress}%
                        </span>
                      </div>

                      {/* Animated Progress Bar Track */}
                      <div style={{ width: '100%', height: '10px', background: '#1e2230', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
                        <div
                          style={{
                            width: `${aiProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #0ea5e9, #a855f7, #ec4899)',
                            borderRadius: '999px',
                            transition: 'width 0.4s ease-out',
                            boxShadow: '0 0 14px rgba(168,85,247,0.7)',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap', gap: '6px' }}>
                        <span>⚡ Local PyTorch Neural Engine • 100% Free Forever</span>
                        <span>✨ Zero Watermarks • 9:16 Vertical HD</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {studioMode === "ai" && (generatedAiVideosList.length > 0 || generatedAiVideo) && (() => {
              const activeList = generatedAiVideosList.length > 0 ? generatedAiVideosList : [generatedAiVideo];
              const curIdx = Math.min(previewPartIdx, activeList.length - 1);
              const curVideo = activeList[curIdx] || activeList[0];

              return (
                <div className="form-section">
                  <div className="section-title">
                    <span className="step-number">03</span>
                    <div>
                      <h2>Review &amp; Publish AI Video{activeList.length > 1 ? ` (${activeList.length} Parts Ready)` : ""}</h2>
                      <p>All parts generated with neural voice, timed captions, cinematic motion, and outro attached.</p>
                    </div>
                  </div>

                  {/* Multi-part tabs if more than 1 part */}
                  {activeList.length > 1 && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {activeList.map((item: any, idx: number) => {
                        const isSelected = idx === curIdx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPreviewPartIdx(idx)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: isSelected ? '1px solid #e50914' : '1px solid #272a38',
                              background: isSelected ? 'rgba(229,9,20,0.15)' : '#161922',
                              color: isSelected ? '#ff3b45' : '#94a3b8',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <span>Part {idx + 1}</span>
                            <span style={{ fontSize: '10px', opacity: 0.8, color: '#38bdf8' }}>({item.duration || aiDuration}s)</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: '12px', padding: '16px', background: '#111218', borderRadius: '12px', border: '1px solid #272a38' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ width: '200px', height: '355px', borderRadius: '8px', overflow: 'hidden', background: '#000', flexShrink: 0, position: 'relative' }}>
                        <video
                          key={curVideo.videoUrl}
                          src={curVideo.videoUrl}
                          controls
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span className="thumb-tag-badge thumb-tag-format" style={{ display: 'inline-block' }}>
                            🤖 {curVideo.category || selectedCategory}
                          </span>
                          {activeList.length > 1 && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                              Part {curIdx + 1} of {activeList.length}
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                            🎬 Outro Attached
                          </span>
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '4px 0 8px 0' }}>{curVideo.title}</h3>
                        <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto' }}>{curVideo.description}</p>
                        <div className="hashtag-row" style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {(curVideo.hashtags || []).slice(0, 15).map((t: string) => (
                            <span key={t} style={{ fontSize: '11px', color: '#38bdf8' }}>#{t}</span>
                          ))}
                        </div>

                        <div style={{ marginTop: '18px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
                              <input type="checkbox" checked={aiPlatforms.youtube} onChange={(e) => setAiPlatforms(p => ({ ...p, youtube: e.target.checked }))} />
                              <FaYoutube color="#ef4444" /> Shorts
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
                              <input type="checkbox" checked={aiPlatforms.facebook} onChange={(e) => setAiPlatforms(p => ({ ...p, facebook: e.target.checked }))} />
                              <FaFacebookF color="#3b82f6" /> Facebook
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d1d5db', cursor: 'pointer' }}>
                              <input type="checkbox" checked={aiPlatforms.instagram} onChange={(e) => setAiPlatforms(p => ({ ...p, instagram: e.target.checked }))} />
                              <FaInstagram color="#ec4899" /> Instagram
                            </label>
                          </div>

                          {/* Publish Single Part Button */}
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handlePublishAiVideo(curVideo)}
                            disabled={isPublishingAi || isPublishingAllAi}
                            style={{ padding: '8px 14px', fontSize: '12px' }}
                          >
                            {isPublishingAi ? <LoaderCircle className="spin" size={13} /> : <Share2 size={13} />}
                            {isPublishingAi ? 'Publishing...' : activeList.length > 1 ? `Publish Part ${curIdx + 1}` : 'Publish Video'}
                          </button>

                          {/* Publish All Parts Button */}
                          {activeList.length > 1 && (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={handlePublishAllAiVideos}
                              disabled={isPublishingAllAi || isPublishingAi}
                              style={{ background: 'linear-gradient(135deg,#e50914,#b20710)', padding: '8px 16px', fontSize: '13px' }}
                            >
                              {isPublishingAllAi ? <LoaderCircle className="spin" size={14} /> : <Share2 size={14} />}
                              {isPublishingAllAi ? `Publishing all ${activeList.length} parts...` : `🚀 Publish All (${activeList.length} Parts)`}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {studioMode === "viral" && (
              <div className="form-section brief-section"><div className="section-title"><span className="step-number">01</span><div><h2>Select video source</h2><p>Paste a YouTube link, or upload an MP4 file directly (zero bot blocks).</p></div></div>
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
                      <Sparkles size={13} /> 🔥 Scrape Viral Online (TikTok Direct MP4)
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
            )}

            {clips.length > 0 && (
              <div className="form-section">
                <div className="section-title"><span className="step-number">02</span><div><h2>Review &amp; Publish Clips</h2><p>{clips.length} clips ready from &quot;{sourceTitle}&quot;. Each has auto-generated description &amp; hashtags.</p></div></div>
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
            <div className="preview-head">
              <div>
                <span className="preview-kicker">{studioMode === "ai" ? "ML ENGINE" : "WORKFLOW"}</span>
                <h3>{studioMode === "ai" ? "AI Video Generation Pipeline" : "Automated Studio Pipeline"}</h3>
              </div>
              <span className="preview-status" style={{ color: studioMode === "ai" ? "#38bdf8" : undefined }}>
                <span style={{ background: studioMode === "ai" ? "#38bdf8" : undefined }} /> {studioMode === "ai" ? "ONNX ACTIVE" : "ACTIVE"}
              </span>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(studioMode === "ai" ? [
                { step: '01', icon: '🧠', title: 'ONNX Semantic Latent Model', desc: 'Trained on 10,500+ trending videos to formulate viral hooks' },
                { step: '02', icon: '📜', title: 'Dynamic Story Synthesis', desc: 'Crafts high-retention 4-part viral narrative and topic focus' },
                { step: '03', icon: '🎙️', title: 'Neural Voice Synthesis', desc: 'Studio-grade natural human speech generated via Edge-TTS' },
                { step: '04', icon: '⚡', title: 'Visuals & Timed Captions', desc: '1080x1920 vertical canvas with synchronized animated text' },
                { step: '05', icon: '🏷️', title: '30 High-Ranking Tags', desc: 'Predicted by ONNX viral tagger for maximum organic reach' },
                { step: '06', icon: '🚀', title: 'One-Click Syndication', desc: 'Direct multi-post to YouTube Shorts, FB & IG Reels' },
              ] : [
                { step: '01', icon: '🔗', title: 'Input Source Video', desc: 'Compatible with YouTube, TikTok, X, Instagram & direct .mp4' },
                { step: '02', icon: '✂️', title: 'Intelligent Segmentation', desc: 'Automatically segmented into optimal vertical short slices' },
                { step: '03', icon: '✍️', title: 'Metadata & Outro Injection', desc: 'Tailored descriptions, hashtags & branded outro attached' },
                { step: '04', icon: '🚀', title: 'Multi-Platform Syndication', desc: 'Simultaneous distribution to YouTube Shorts, FB & IG Reels' },
                { step: '05', icon: '📧', title: 'Automated Delivery Alert', desc: 'Published post links delivered directly to your Gmail inbox' },
                { step: '06', icon: '🗑️', title: 'Storage Optimization', desc: 'Temporary slice files purged automatically after upload' },
              ]).map(({ step, icon, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ background: studioMode === "ai" ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'linear-gradient(135deg,#e50914,#b20710)', color: '#fff', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, flexShrink: 0, boxShadow: studioMode === "ai" ? '0 0 10px rgba(14,165,233,0.4)' : '0 0 10px rgba(229,9,20,0.4)' }}>{step}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: '#ffffff' }}>{icon} {title}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4, marginTop: '2px' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="preview-bottom"><span><span className="quality-dot" style={{ background: studioMode === "ai" ? "#38bdf8" : undefined }} /> {studioMode === "ai" ? "ONNX Format ML" : "High Definition"}</span><span>{studioMode === "ai" ? "100% Free · Real Dataset" : "Zero API costs · 100% Free"}</span></div>
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
            <option>Viral</option>
            <option>AI Videos</option>
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
            <div className="thumb-tags-row">
              <span className="thumb-tag-badge thumb-tag-format">{video.isAiVideo ? (video.format || "AI Video") : "Viral"}</span>
              {video.isCron && (
                <span className="thumb-tag-badge thumb-tag-autopilot">Auto-Pilot</span>
              )}
            </div>
          </div>
        )}
    <div className="video-details">
      <div className="video-type-label"><Film size={11} /> {video.isAiVideo ? (video.format || "AI Video") : "Viral"}</div>
      <h3>{video.title}</h3>
      <p style={{ color: video.status === 'failed' ? '#d32f2f' : 'inherit' }}>{video.description}</p>
      <div className="video-card-actions">
        <div className="card-platform-links">
          {(video.sourceUrl || video.sourceLink) && (
            <a
              href={video.sourceUrl || video.sourceLink}
              target="_blank"
              rel="noreferrer"
              className="platform-btn"
              style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#d1d5db', textDecoration: 'none' }}
              title={`Original Source Video: ${video.sourceUrl || video.sourceLink}`}
            >
              <Link size={11} />
              <span>Source</span>
            </a>
          )}
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

        {/* Automated Content Mode & Random/Chosen Type Toggler */}
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #1f2230' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
            🎲 Content Selection Toggler:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={() => updateCronSelectionMode("random")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: cronSelectionMode === "random" ? '1.5px solid #10b981' : '1px solid #272a38',
                background: cronSelectionMode === "random" ? 'rgba(16, 185, 129, 0.15)' : '#0d0e15',
                color: cronSelectionMode === "random" ? '#34d399' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              🎲 Post Randomly (Random Category, Voice, Style & Part)
            </button>
            <button
              type="button"
              onClick={() => updateCronSelectionMode("chosen")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: cronSelectionMode === "chosen" ? '1.5px solid #ec4899' : '1px solid #272a38',
                background: cronSelectionMode === "chosen" ? 'rgba(236, 72, 153, 0.15)' : '#0d0e15',
                color: cronSelectionMode === "chosen" ? '#f472b6' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              🎯 Post Chosen Type Only (Chosen Category, Voice, Style & Parts)
            </button>
          </div>
          <p style={{ margin: '-4px 0 14px', fontSize: '11px', color: '#64748b' }}>
            {cronSelectionMode === "random"
              ? "Random mode: A fresh random video category, random character picture style, random voice narrator, random caption style, and random parts will be posted every time."
              : `Chosen mode: Only your chosen category (${selectedCategory}), chosen voice, chosen picture style (${selectedSceneStyle}), and chosen parts will be posted, with freshly generated AI stories.`}
          </p>

          <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
            🎯 Automated Content Mode:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => updateCronContentType("viral")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: cronContentType === "viral" ? '1.5px solid #ff3b45' : '1px solid #272a38',
                background: cronContentType === "viral" ? 'rgba(255, 59, 69, 0.15)' : '#0d0e15',
                color: cronContentType === "viral" ? '#ff4d56' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              🎬 Viral Reels Only
            </button>
            <button
              type="button"
              onClick={() => updateCronContentType("ai")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: cronContentType === "ai" ? '1.5px solid #a855f7' : '1px solid #272a38',
                background: cronContentType === "ai" ? 'rgba(168, 85, 247, 0.15)' : '#0d0e15',
                color: cronContentType === "ai" ? '#c084fc' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              🤖 AI Story Only
            </button>
            <button
              type="button"
              onClick={() => updateCronContentType("both")}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                border: cronContentType === "both" ? '1.5px solid #38bdf8' : '1px solid #272a38',
                background: cronContentType === "both" ? 'rgba(56, 189, 248, 0.15)' : '#0d0e15',
                color: cronContentType === "both" ? '#38bdf8' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              🔄 Both (Alternating)
            </button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
            {cronContentType === "viral" && "Each cron execution publishes trending viral reels."}
            {cronContentType === "ai" && "Each cron execution automatically generates and publishes high-retention AI stories."}
            {cronContentType === "both" && "Each cron execution alternates one by one: first Viral Reels, next AI Stories, and so on."}
          </p>
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

      {/* Custom Outro Video Setting & Live Preview (Requirement) */}
      <div className="outro-setting-card">
        {/* Header Section */}
        <div className="outro-header">
          <div className="outro-header-info">
            <div className="outro-icon-badge">
              <Clapperboard size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>Call-to-Action Outro Video</h2>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 9px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: isCustomOutro ? 'rgba(56,189,248,0.15)' : 'rgba(148,163,184,0.12)',
                  color: isCustomOutro ? '#38bdf8' : '#94a3b8',
                  border: isCustomOutro ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(148,163,184,0.2)',
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCustomOutro ? '#38bdf8' : '#94a3b8' }} />
                  {isCustomOutro ? 'CUSTOM OUTRO ACTIVE' : 'DEFAULT OUTRO'}
                </span>
                {outroUpdatedAt && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    • Updated {new Date(outroUpdatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.55 }}>
                Automatically stitched at the end of every viral clip across YouTube Shorts, Instagram Reels, and Facebook Reels. Uploading a new outro replaces the active file and deletes previous assets from Cloud storage.
              </p>
            </div>
          </div>
        </div>

        {/* Layout Grid: 9:16 Preview Player + Management Hub */}
        <div className="outro-layout-grid">
          {/* Column 1: Video Preview Frame */}
          <div>
            {outroUrl ? (
              <div className="outro-preview-frame">
                <video
                  key={outroUrl}
                  src={outroUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  background: 'rgba(0,0,0,0.75)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: '20px',
                  padding: '2px 8px',
                  fontSize: '9px',
                  fontWeight: 800,
                  color: '#f8fafc',
                  letterSpacing: '0.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  <Play size={8} fill="currentColor" /> LIVE PREVIEW
                </div>
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(0,0,0,0.75)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  pointerEvents: 'none',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  9:16
                </div>
              </div>
            ) : (
              <div className="outro-preview-frame" style={{ border: '1.5px dashed #2d3142', color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '12px' }}>
                No outro video configured
              </div>
            )}
          </div>

          {/* Column 2: Specs & Upload Controls */}
          <div className="outro-details-panel">
            {/* Specs row */}
            <div className="outro-specs-row">
              <div className="outro-spec-item">
                <div className="outro-spec-item-icon" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                  <Scissors size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Workflow Rule</div>
                  <div style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 600 }}>Appends to Part 1, Part 2...</div>
                </div>
              </div>

              <div className="outro-spec-item">
                <div className="outro-spec-item-icon" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                  <Sparkles size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Recommended Specs</div>
                  <div style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 600 }}>1080×1920 • MP4 / MOV</div>
                </div>
              </div>

              <div className="outro-spec-item">
                <div className="outro-spec-item-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                  <ShieldCheck size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Cloud Storage</div>
                  <div style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 600 }}>Auto-deletes old videos</div>
                </div>
              </div>
            </div>

            {/* Upload Zone */}
            <div className="outro-upload-zone">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(229,9,20,0.15)', color: '#ff3b45', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Upload size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                      {isCustomOutro ? "Replace Outro Video" : "Upload Custom Outro Video"}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      MP4, MOV, or WEBM (up to 50MB). Automatically deployed across cloud &amp; worker runners.
                    </div>
                  </div>
                </div>
              </div>

              <div className="outro-actions-bar">
                <input
                  type="file"
                  ref={outroFileInputRef}
                  accept="video/mp4,video/quicktime,video/webm"
                  style={{ display: 'none' }}
                  onChange={handleOutroUpload}
                />
                <button
                  type="button"
                  disabled={isUploadingOutro}
                  onClick={() => outroFileInputRef.current?.click()}
                  className="secondary-button"
                  style={{
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    background: '#1a1d2c',
                    borderColor: '#2e3347',
                    color: '#ffffff',
                  }}
                >
                  {isUploadingOutro ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}
                  {isUploadingOutro ? "Uploading & Storing..." : "Choose Outro Video"}
                </button>

                {isCustomOutro && (
                  <button
                    type="button"
                    disabled={isUploadingOutro}
                    onClick={handleResetOutro}
                    className="secondary-button"
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      background: 'rgba(239, 68, 68, 0.08)',
                    }}
                    title="Delete custom outro and restore default"
                  >
                    <Trash2 size={13} /> Reset to Default
                  </button>
                )}

                {outroUrl && (
                  <a
                    href={outroUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button"
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      color: '#94a3b8',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginLeft: 'auto',
                    }}
                  >
                    <ExternalLink size={13} /> Fullscreen
                  </a>
                )}
              </div>
            </div>

            {/* Status note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: '#64748b' }}>
              <Check size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span>Verified with Cloudinary CDN. Next clips will stitch this exact active outro.</span>
            </div>
          </div>
        </div>
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
        <section
          className="auth-modal"
          role="dialog"
          style={{
            maxWidth: '440px',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {!isDeleting && <button className="icon-button modal-close" onClick={() => setVideoToDelete(null)} aria-label="Close"><X size={19} /></button>}
          <div className="eyebrow"><span className="eyebrow-dot" style={{ background: '#ea4335' }} /> DELETE VIDEO</div>
          <h2
            id="auth-title"
            style={{
              fontSize: '18px',
              fontWeight: 700,
              lineHeight: 1.4,
              margin: '12px 0 8px',
              wordBreak: 'break-word',
            }}
          >
            Delete "{videoToDelete.title.length > 70 ? `${videoToDelete.title.slice(0, 67)}...` : videoToDelete.title}"?
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#94a3b8' }}>
            Where would you like to delete this video from?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto', paddingTop: '10px' }}>
            <button className="primary-button" disabled={isDeleting} onClick={() => executeDelete(false)} style={{ justifyContent: 'center' }}>
              {isDeleting ? <LoaderCircle className="spin" size={17} /> : "Remove from Library & Cloudinary"}
            </button>
            { (videoToDelete.youtubeVideoId || videoToDelete.facebookVideoId || videoToDelete.instagramVideoId || videoToDelete.youtube === 1 || videoToDelete.facebook === 1 || videoToDelete.instagram === 1) && (
              <button className="secondary-button" disabled={isDeleting} onClick={() => executeDelete(true)} style={{ justifyContent: 'center', borderColor: '#ea4335', color: '#ea4335', backgroundColor: '#ea433511' }}>
                {isDeleting ? <LoaderCircle className="spin" size={17} /> : "Delete from Library, Cloudinary & Socials"}
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
