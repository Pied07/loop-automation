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
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Mic2,
  Mountain,
  Music2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Users,
  WandSparkles,
  X,
  Trash2,
} from "lucide-react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { auth, firebaseConfigured, listenToVideos, deleteVideo, deleteVideosByYouTubeId, deleteVideosByFacebookId, saveVideo, type VideoRecord } from "./firebase";
import { generateVideoContent, generateDetailedPrompt, renderVideo, publishToSocials, deleteFromYouTube, deleteFromFacebook, getPublishedAutomationVideos } from "./actions";

type GeneratedScript = {
  title: string;
  description: string;
  hashtags: string[];
  scenes: { imagePrompt: string; caption: string }[];
  captions: string;
};

const formats = [
  { name: "ASMR", icon: AudioLines, tone: "mint", detail: "Quiet, sensory stories" },
  { name: "Horror", icon: Flame, tone: "coral", detail: "Spooky tales & chills" },
  { name: "Historical", icon: Clapperboard, tone: "gold", detail: "Tales from the past" },
  { name: "Motivational", icon: Sparkles, tone: "mint", detail: "Inspiring stories" },
  { name: "Sci-Fi", icon: Lightbulb, tone: "blue", detail: "Future & tech" },
  { name: "Romance", icon: Flower2, tone: "pink", detail: "Love & connection" },
  { name: "Mystery", icon: WandSparkles, tone: "lilac", detail: "Unsolved & curious" },
  { name: "Comedy", icon: AudioLines, tone: "yellow", detail: "Funny & entertaining" },
  { name: "Fantasy", icon: Mountain, tone: "sky", detail: "Magic & adventure" },
];

const promptSeeds: Record<string, string> = {
  ASMR: "Create a quiet, intimate ASMR story with delicate sensory details, gentle pacing, and a satisfying reveal.",
  Horror: "Create a terrifying, atmospheric horror story with intense suspense and a shocking twist.",
  Historical: "Create a rich, historically accurate narrative set in a fascinating era of the past.",
  Motivational: "Create an uplifting, powerful story about overcoming adversity and finding inner strength.",
  "Sci-Fi": "Create a futuristic science fiction story with mind-bending technology and vast worlds.",
  Romance: "Create a heartfelt, deeply emotional romance story about unexpected love and connection.",
  Mystery: "Create a suspenseful mystery story with clues, deductions, and a brilliant reveal.",
  Comedy: "Create a lighthearted, humorous story with clever dialogue and a funny conclusion.",
  Fantasy: "Create an epic fantasy story filled with magic, mythical creatures, and grand adventure.",
  Food: "Create an appetizing food short with rich natural color, crisp preparation details, close-up texture, and a beautiful finished dish.",
  "Study focus": "Create a calming study-focus short with a composed desk scene, soft daylight, gentle ambient motion, and a distraction-free feel.",
};

type Screen = "home" | "studio" | "library" | "settings";

function mergeVideoRecords(...groups: VideoRecord[][]): VideoRecord[] {
  const merged = new Map<string, VideoRecord>();
  for (const video of groups.flat()) {
    const key = video.youtubeVideoId || video.id;
    const existing = merged.get(key);
    const score = (item: VideoRecord) => (item.captions?.length || 0) + (item.videoUrl && !item.videoUrl.includes("youtube.com/") ? 100 : 0) + (item.hashtags?.length || 0);
    if (!existing || score(video) >= score(existing)) merged.set(key, video);
  }
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function StyleImageCard({ s, isSelected, onClick }: { s: any, isSelected: boolean, onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div onClick={onClick} style={{ cursor: 'pointer', borderRadius: '10px', overflow: 'hidden', border: isSelected ? '2.5px solid #22c55e' : '2.5px solid #e5e7eb', boxShadow: isSelected ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 1px 4px rgba(0,0,0,0.08)', transition: 'all 0.2s', background: '#fff' }}>
      <div style={{ position: 'relative', height: '90px', overflow: 'hidden', background: errored ? s.fallback : '#f3f4f6' }}>
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
          <div style={{ position: 'absolute', top: 5, right: 5, background: '#22c55e', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        )}
      </div>
      <div style={{ padding: '6px 8px', background: isSelected ? '#f0fdf4' : '#fafaf9' }}>
        <div style={{ fontWeight: 700, fontSize: '12px', color: isSelected ? '#16a34a' : '#374151' }}>{s.label}</div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{s.desc}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const imageStylesOptions = [
    {
      id: "Realistic", label: "Realistic", desc: "Photorealistic",
      img: "/thumbnails/realistic.png",
      fallback: "linear-gradient(135deg,#1a3a5c,#4a7fb5)"
    },
    {
      id: "Anime", label: "Anime", desc: "Illustrated",
      img: "/thumbnails/anime.png",
      fallback: "linear-gradient(135deg,#ff6b9d,#c9b3ff)"
    },
    {
      id: "Cartoon", label: "Cartoon", desc: "Fun & Bold",
      img: "/thumbnails/cartoon.png",
      fallback: "linear-gradient(135deg,#f7971e,#21d4fd)"
    },
    {
      id: "Ghibli", label: "Ghibli", desc: "Painterly",
      img: "/thumbnails/ghibli.png",
      fallback: "linear-gradient(135deg,#134e5e,#71b280)"
    },
    {
      id: "Watercolor", label: "Watercolor", desc: "Soft Art",
      img: "/thumbnails/watercolor.png",
      fallback: "linear-gradient(160deg,#fce4ec,#e3f2fd)"
    },
    {
      id: "3D Render", label: "3D Render", desc: "Volumetric",
      img: "/thumbnails/3d.png",
      fallback: "linear-gradient(135deg,#1f1c2c,#928dab)"
    },
  ];

  const captionStylesOptions = [
    { id: "Modern", label: "Modern", preview: { font: "'Inter', sans-serif", weight: 700, transform: "none", bg: "rgba(0,0,0,0.6)", color: "#fff", border: "none", shadow: "none" } },
    { id: "Bold", label: "Bold", preview: { font: "'Inter', sans-serif", weight: 900, transform: "uppercase", bg: "rgba(0,0,0,0.85)", color: "#FFD700", border: "none", shadow: "2px 2px 0 #000" } },
    { id: "Classic", label: "Classic", preview: { font: "'Georgia', serif", weight: 400, transform: "none", bg: "rgba(20,10,5,0.7)", color: "#f5e6c8", border: "1px solid #f5e6c8", shadow: "none" } },
    { id: "Neon", label: "Neon", preview: { font: "'Inter', sans-serif", weight: 800, transform: "none", bg: "rgba(0,0,0,0.7)", color: "#00FFFF", border: "none", shadow: "0 0 8px #00FFFF, 0 0 20px #00FFFF" } },
    { id: "Minimal", label: "Minimal", preview: { font: "'Inter', sans-serif", weight: 400, transform: "none", bg: "transparent", color: "#fff", border: "none", shadow: "1px 1px 3px rgba(0,0,0,0.9)" } },
    { id: "Cinematic", label: "Cinematic", preview: { font: "'Georgia', serif", weight: 300, transform: "none", bg: "rgba(0,0,0,0.75)", color: "#fff", border: "2px solid rgba(255,255,255,0.3)", shadow: "none" } },
  ];

  const voiceOptions = [
    { id: "Adam",    label: "Adam",    desc: "Deep · Narration",     emoji: "🎙️" },
    { id: "Rachel",  label: "Rachel",  desc: "Calm · Clear Female",   emoji: "🎤" },
    { id: "Josh",   label: "Josh",    desc: "Young · Casual Male",   emoji: "🧑" },
    { id: "Bella",  label: "Bella",   desc: "Soft · Warm Female",    emoji: "🌸" },
    { id: "Daniel", label: "Daniel",  desc: "British · Authoritative",emoji: "🇬🇧" },
    { id: "Lily",   label: "Lily",    desc: "British · Warm Female", emoji: "🌷" },
    { id: "Harry",  label: "Harry",   desc: "Anxious · Intense Male",emoji: "😰" },
    { id: "Freya",  label: "Freya",   desc: "Strong · Confident",    emoji: "⚡" },
    { id: "Liam",   label: "Liam",    desc: "Crisp · Articulate",    emoji: "🎯" },
    { id: "Grace",  label: "Grace",   desc: "Southern · Warm",       emoji: "🌻" },
    { id: "Ethan",  label: "Ethan",   desc: "Raspy · Dark Tone",     emoji: "🌑" },
    { id: "Emily",  label: "Emily",   desc: "Gentle · Storyteller",  emoji: "📖" },
    { id: "Clyde",  label: "Clyde",   desc: "Midwest · Gravelly",    emoji: "🤠" },
    { id: "Matilda",label: "Matilda", desc: "Warm · Friendly AU",    emoji: "🦘" },
    { id: "Sam",    label: "Sam",     desc: "Raspy · Mysterious",    emoji: "🕵️" },
  ];

  const voicePersonalities: Record<string, { pitch: number; rate: number }> = {
    Adam:    { pitch: 0.7,  rate: 0.85 },
    Rachel:  { pitch: 1.2,  rate: 0.95 },
    Josh:    { pitch: 0.95, rate: 1.05 },
    Bella:   { pitch: 1.15, rate: 0.9  },
    Daniel:  { pitch: 0.8,  rate: 0.88 },
    Lily:    { pitch: 1.1,  rate: 0.93 },
    Harry:   { pitch: 0.85, rate: 0.92 },
    Freya:   { pitch: 1.0,  rate: 1.0  },
    Liam:    { pitch: 0.9,  rate: 0.97 },
    Grace:   { pitch: 1.05, rate: 0.88 },
    Ethan:   { pitch: 0.75, rate: 0.8  },
    Emily:   { pitch: 1.2,  rate: 0.9  },
    Clyde:   { pitch: 0.65, rate: 0.82 },
    Matilda: { pitch: 1.15, rate: 1.0  },
    Sam:     { pitch: 0.72, rate: 0.85 },
  };

  const playDemoVoice = (voiceId: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const p = voicePersonalities[voiceId] || { pitch: 1, rate: 1 };
    const utterance = new SpeechSynthesisUtterance(
      `Hi! I'm ${voiceId}. I'll be narrating your AI story video. How does my voice sound?`
    );
    utterance.pitch = p.pitch;
    utterance.rate = p.rate;
    utterance.volume = 1;
    // Try to find a matching browser voice
    const voices = window.speechSynthesis.getVoices();
    const femaleIds = ['Amy', 'Emma', 'Joanna'];
    const preferFemale = femaleIds.includes(voiceId);
    const match = voices.find(v =>
      preferFemale ? v.name.toLowerCase().includes('female') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Karen')
                   : v.name.toLowerCase().includes('male') || v.name.includes('Alex') || v.name.includes('Daniel')
    );
    if (match) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  };

  const [screen, setScreen] = useState<Screen>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("loop-studio-generation-event") ? "library" : "home"
  );
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("Creator");
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [customFormat, setCustomFormat] = useState("");
  const [ideaText, setIdeaText] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [numImages, setNumImages] = useState(0);
  const [imageStyle, setImageStyle] = useState("");
  const [ttsLanguage, setTtsLanguage] = useState("");
  const [captionStyle, setCaptionStyle] = useState("");
  const [voiceType, setVoiceType] = useState("");
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [filter, setFilter] = useState("All videos");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingInBackground, setIsGeneratingInBackground] = useState(() =>
    typeof window !== "undefined" && Boolean(window.localStorage.getItem("loop-studio-generation-event"))
  );
  const [generationEventId, setGenerationEventId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("loop-studio-generation-event")
  );
  const [isBuildingPrompt, setIsBuildingPrompt] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  const [generatedScriptContext, setGeneratedScriptContext] = useState("");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [connections, setConnections] = useState<string[]>([]);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);
  const [platformTab, setPlatformTab] = useState("Self");
  const [youtubeSubTab, setYoutubeSubTab] = useState("Shorts");
  const [videoToDelete, setVideoToDelete] = useState<VideoRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function getMissingDetails() {
    const missing: string[] = [];
    if (!selectedFormat || (selectedFormat === "Custom" && !customFormat.trim())) missing.push("video type");
    if (!videoDuration) missing.push("video duration");
    if (!numImages) missing.push("number of images");
    if (!imageStyle) missing.push("image style");
    if (!captionStyle) missing.push("caption style");
    if (!voiceType) missing.push("narration voice");
    if (!ttsLanguage) missing.push("narration language");
    return missing;
  }

  function getSelectedFormat() {
    return selectedFormat === "Custom" ? customFormat.trim() : selectedFormat;
  }

  function getScriptContext() {
    return JSON.stringify({
      idea: ideaText.trim(),
      format: getSelectedFormat(),
      videoDuration,
      numImages,
      imageStyle,
      captionStyle,
      voiceType,
      ttsLanguage
    });
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cachedVideos = JSON.parse(localStorage.getItem("loop-studio-session-videos") || "[]");
        if (Array.isArray(cachedVideos)) {
          const sessionVideos = cachedVideos
            .filter((video: VideoRecord) => video?.sessionOnly && (video.videoUrl || video.youtubeVideoId))
            .map((video: VideoRecord) => video.id.startsWith("session-") ? { ...video, id: video.id.slice("session-".length) } : video);
          window.setTimeout(() => setVideos(sessionVideos), 0);
        }
      } catch {
        localStorage.removeItem("loop-studio-session-videos");
      }
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
        const newConns = [...new Set([...existingConns, ...newlyConnected])];
        localStorage.setItem("app_connections", JSON.stringify(newConns));
        setConnections(newConns);
        notify(`Connected: ${newlyConnected.join(" and ")}.`);
        if (searchParams.get("warning") === "meta_no_instagram") notify("Facebook Page connected. Link a Professional Instagram account to that Page to enable Instagram publishing.");
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => setScreen("settings"), 0);
      } else if (connectionError) {
        const errorMessages: Record<string, string> = {
          oauth_rejected: "Access was declined. Reconnect and approve the requested permissions.",
          missing_credentials: "Facebook App ID or Meta App Secret is missing from the server environment.",
          meta_permissions_missing: "Meta did not grant Page access. Reconnect and approve pages_show_list and pages_manage_posts.",
          meta_no_pages: "No Facebook Pages were available to this login. Create or get Page task access, then reconnect.",
          meta_page_access_missing: "Meta listed a Page but did not grant its access token. Reconnect and approve Page permissions.",
          meta_no_instagram: "No linked Instagram Professional account was found. Convert Instagram to Business/Creator and link it to the Facebook Page, then reconnect.",
          token_exchange_failed: "Meta could not complete the connection. Check the app redirect URI and try reconnecting.",
          no_code: "Meta returned without an authorization code. Try connecting again.",
          instagram_credentials_missing: "Configure the Instagram Login App ID and its App Secret. META_APP_SECRET can be reused only when the Instagram and Facebook App IDs are the same.",
          instagram_oauth_state_invalid: "Instagram sign-in expired or could not be verified. Start the connection again.",
          instagram_token_exchange_failed: "Instagram could not exchange the sign-in code. Verify the Instagram App credentials and exact callback URL.",
          instagram_profile_unavailable: "Instagram login succeeded, but Meta did not return a professional account. Check the Instagram account type and app permissions."
        };
        const failedPlatform = connectionError.startsWith("instagram_") ? "Instagram" : "Facebook";
        const newConns = existingConns.filter((name) => name !== failedPlatform);
        localStorage.setItem("app_connections", JSON.stringify(newConns));
        setConnections(newConns);
        notify(errorMessages[connectionError] || `Meta connection failed (${connectionError}).`);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (existingConns.length > 0) {
        setConnections(existingConns);
      }
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    let unsubscribeVideos: () => void;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (unsubscribeVideos) unsubscribeVideos();
        return;
      }
      setDisplayName(user.displayName || user.email?.split("@")[0] || "Creator");
      setSignedIn(true);
      setScreen("studio");
      unsubscribeVideos = listenToVideos(user.uid, (vids) => {
        setVideos((current) => mergeVideoRecords(current.filter((video) => video.sessionOnly), vids));
      });
    });
    return () => {
      unsubscribeAuth();
      if (unsubscribeVideos) unsubscribeVideos();
    };
  }, []);

  useEffect(() => {
    if (!connections.includes("YouTube") || !signedIn || !auth?.currentUser) return;
    const userId = auth.currentUser.uid;
    let active = true;
    void getPublishedAutomationVideos().then(async (recovered) => {
      if (!active) return;
      let hiddenVideoIds: string[] = [];
      try { hiddenVideoIds = JSON.parse(localStorage.getItem("loop-studio-hidden-youtube-videos") || "[]"); } catch { hiddenVideoIds = []; }
      const records = (recovered as VideoRecord[]).filter((video) => !hiddenVideoIds.includes(video.youtubeVideoId || ""));
      await Promise.allSettled(records.map((video) => saveVideo(userId, video)));
      if (active) setVideos((current) => mergeVideoRecords(current, records.map((video) => ({ ...video, sessionOnly: false }))));
    }).catch((error) => console.warn("Could not recover videos from YouTube:", error));
    return () => { active = false; };
  }, [connections, signedIn]);

  useEffect(() => {
    if (!generationEventId) return;
    let active = true;
    let timer: number | undefined;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/generation-status?eventId=${encodeURIComponent(generationEventId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to check generation status.");
        if (!active) return;

        if (data.status === "completed") {
          const result = data.result;
          if (result?.success && result.video?.videoUrl) {
            let video: VideoRecord = {
              id: generationEventId,
              ...result.video,
              sessionOnly: true
            };
            const currentUser = auth?.currentUser;
            if (currentUser && firebaseConfigured) {
              try {
                await saveVideo(currentUser.uid, { ...video, sessionOnly: false });
                video = { ...video, sessionOnly: false };
                const cachedVideos = JSON.parse(localStorage.getItem("loop-studio-session-videos") || "[]") as VideoRecord[];
                localStorage.setItem("loop-studio-session-videos", JSON.stringify(cachedVideos.filter((item) => item.id !== video.id && item.id !== `session-${video.id}` && item.videoUrl !== video.videoUrl)));
              } catch (error) {
                console.error("Failed to save generated video link to Firestore:", error);
                notify("Video is ready, but its link could not be saved to your cloud library. It is kept on this device.");
              }
            }
            if (video.sessionOnly) {
              const cachedVideos = JSON.parse(localStorage.getItem("loop-studio-session-videos") || "[]") as VideoRecord[];
              localStorage.setItem("loop-studio-session-videos", JSON.stringify([video, ...cachedVideos.filter((item) => item.id !== video.id)]));
            }
            setVideos((current) => mergeVideoRecords([video], current.filter((item) => item.id !== video.id && item.id !== `session-${video.id}`)));
            notify(result.deliveryMessage || "Video is ready. Its link is available in this session's library.");
          } else {
            notify(result?.error || "Video generation failed.");
          }
          setIsGeneratingInBackground(false);
          window.localStorage.removeItem("loop-studio-generation-event");
          setGenerationEventId(null);
          return;
        }

        if (data.status === "failed") {
          setIsGeneratingInBackground(false);
          notify(data.error || "Video generation failed.");
          window.localStorage.removeItem("loop-studio-generation-event");
          setGenerationEventId(null);
          return;
        }

        timer = window.setTimeout(pollStatus, 3000);
      } catch (error) {
        if (!active) return;
        console.error("Generation status check failed:", error);
        timer = window.setTimeout(pollStatus, 5000);
      }
    };

    void pollStatus();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [generationEventId]);

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

  async function buildPrompt() {
    const missing = getMissingDetails();
    if (missing.length) {
      notify(`First fill all remaining details so AI can understand your vision: ${missing.join(", ")}.`);
      return;
    }
    let format = selectedFormat;
    if (selectedFormat === "Custom") {
      format = customFormat.trim();
      if (!format) {
        notify("Please mention a format first.");
        return;
      }
    }

    setIsBuildingPrompt(true);
    const idea = ideaText.trim() || `Invent a fresh, original ${format} story with a strong opening, coherent visual moments, and a satisfying ending.`;
    
    try {
      const generated = await generateDetailedPrompt(idea, {
        format,
        duration: videoDuration,
        imageCount: numImages,
        imageStyle,
        captionStyle,
        voice: voiceType,
        language: ttsLanguage
      });
      setIdeaText(generated);
      notify("Your video prompt is ready to refine or copy.");
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "AI prompt generation failed. Check the provider keys and try again.");
    } finally {
      setIsBuildingPrompt(false);
    }
  }

  async function generateScript() {
    const missing = getMissingDetails();
    if (missing.length) {
      notify(`First fill all remaining details so AI can understand your vision: ${missing.join(", ")}.`);
      return;
    }

    const format = getSelectedFormat();
    const scriptBrief = `${ideaText.trim() || `Invent a fresh, original ${format} story with a strong opening, emotional progression, and satisfying ending.`}\n\nProduction settings: ${videoDuration} seconds, exactly ${numImages} scenes, ${imageStyle} image style, ${captionStyle} subtitles, ${voiceType} narration in ${ttsLanguage}.`;
    setIsGeneratingScript(true);
    try {
      const script = await generateVideoContent(scriptBrief, format, numImages, videoDuration);
      setGeneratedScript(script);
      setGeneratedScriptContext(getScriptContext());
      notify("AI script generated. Regenerating will only replace this script.");
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "Script generation failed. Check your AI provider settings.");
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function handleGenerateVideo() {
    const missing = getMissingDetails();
    if (missing.length) {
      notify(`First fill all remaining details so AI can understand your vision: ${missing.join(", ")}.`);
      return;
    }
    let format = selectedFormat;
    if (selectedFormat === "Custom") {
      format = customFormat.trim();
      if (!format) {
        notify("Please mention a format first.");
        return;
      }
    }

    if (!generatedScript) {
      notify("Generate the script first to review the story before making the video.");
      return;
    }
    if (generatedScriptContext !== getScriptContext()) {
      notify("Your settings changed. Regenerate the script to match them before making the video.");
      return;
    }

    if (!auth?.currentUser && !firebaseConfigured) {
      notify("Sign in to generate a video and upload its temporary assets for rendering.");
      return;
    }
    setIsGenerating(true);
    setGenerationStep("Starting background generation...");
    setProgress(50);
    
    try {
      const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : undefined;
      const res = await fetch("/api/trigger-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: ideaText.trim() || generatedScript.description,
          script: generatedScript,
          format,
          userId: auth?.currentUser?.uid || null,
          connections,
          userEmail: auth?.currentUser?.email || "",
          idToken,
          videoDuration,
          numImages,
          imageStyle,
          ttsLanguage,
          captionStyle,
          voiceType
        })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (!data.eventId) throw new Error("The background job started without returning its status ID.");

      setProgress(100);
      setGenerationEventId(data.eventId);
      window.localStorage.setItem("loop-studio-generation-event", data.eventId);
      setIsGeneratingInBackground(true);
      setScreen("library");
      setIdeaText("");
      setIsGenerating(false);
      setGenerationStep("");
      setProgress(0);
      notify("Video generation started. The finished link will appear in this session's library.");
      
    } catch (err: any) {
      console.error(err);
      notify(err?.message || "Error starting background video generation.");
      setIsGenerating(false);
      setGenerationStep("");
      setProgress(0);
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
    } else if (platform === 'Instagram') {
      window.location.href = "/api/auth/instagram/connect";
      return;
    } else if (platform === 'Facebook') {
      const clientId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
      const params = new URLSearchParams({ client_id: clientId || "", redirect_uri: redirectUri, response_type: "code", scope: "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish" });
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

  async function executeDelete(deleteFromYouTubeToo: boolean) {
    if (!videoToDelete || (!videoToDelete.sessionOnly && !auth?.currentUser)) return;
    const target = videoToDelete;
    setIsDeleting(true);
    try {
      if (deleteFromYouTubeToo && target.youtubeVideoId) {
        await deleteFromYouTube(target.youtubeVideoId);
      }
      if (deleteFromYouTubeToo && target.facebookVideoId) {
        await deleteFromFacebook(target.facebookVideoId);
      }

      if (target.youtubeVideoId && firebaseConfigured && auth?.currentUser) {
        await deleteVideosByYouTubeId(auth.currentUser.uid, target.youtubeVideoId);
      }
      if (target.facebookVideoId && firebaseConfigured && auth?.currentUser) {
        await deleteVideosByFacebookId(auth.currentUser.uid, target.facebookVideoId);
      }
      
      if (!target.youtubeVideoId && !target.facebookVideoId && !target.sessionOnly && auth?.currentUser) {
        await deleteVideo(auth.currentUser.uid, target.id);
      }

      if (target.sessionOnly || target.youtubeVideoId || target.facebookVideoId) {
        const cachedVideos = JSON.parse(localStorage.getItem("loop-studio-session-videos") || "[]") as VideoRecord[];
        localStorage.setItem("loop-studio-session-videos", JSON.stringify(cachedVideos.filter((video) => video.id !== target.id && video.youtubeVideoId !== target.youtubeVideoId && video.facebookVideoId !== target.facebookVideoId)));
      }
      if (target.youtubeVideoId) {
        const hiddenVideoIds = JSON.parse(localStorage.getItem("loop-studio-hidden-youtube-videos") || "[]") as string[];
        if (!hiddenVideoIds.includes(target.youtubeVideoId)) localStorage.setItem("loop-studio-hidden-youtube-videos", JSON.stringify([...hiddenVideoIds, target.youtubeVideoId]));
      }
      setVideos((current) => current.filter((video) => {
        if (target.youtubeVideoId) return video.youtubeVideoId !== target.youtubeVideoId;
        if (target.facebookVideoId) return video.facebookVideoId !== target.facebookVideoId;
        return video.id !== target.id;
      }));
      setToast(deleteFromYouTubeToo && (target.youtubeVideoId || target.facebookVideoId) ? "Video removed from socials and your library." : "Video removed from your library.");
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
      if (!video.youtubeVideoId) return false;
      if (youtubeSubTab === "Shorts") {
        matchesTab = true;
      } else {
        matchesTab = false; // We don't support regular videos or posts yet
      }
    } else if (platformTab === "Instagram") {
      matchesTab = false; // Add IG logic later
    } else if (platformTab === "Facebook") {
      matchesTab = false; // Add FB logic later
    }

    return matchesFormat && matchesQuery && matchesTab;
  }).sort((a, b) => {
    // Latest video first
    const dateA = new Date(a.createdAt || "1970-01-01").getTime();
    const dateB = new Date(b.createdAt || "1970-01-01").getTime();
    return dateB - dateA;
  });

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
      <a className="brand" href="#studio" onClick={(event) => { event.preventDefault(); setScreen("studio"); }}><span className="brand-mark"><Play size={17} fill="currentColor" /></span><span>loop<span className="brand-dot">.</span></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Workspace">
        <button className={screen === "studio" ? "nav-item active" : "nav-item"} onClick={() => { setScreen("studio"); setMobileNav(false); }}><WandSparkles size={17} /> Create a short</button>
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
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle menu"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>{screen === "studio" ? "Create a short" : screen === "library" ? "My videos" : "Settings"}</strong></div><div className="topbar-actions"><span className={`connection-pill ${firebaseConfigured ? "connected" : "preview"}`}><span />{firebaseConfigured ? "Firebase connected" : "Preview mode"}</span><button className="help-button" onClick={() => notify("Connect Firebase and an AI video provider to enable production workflows.")}><CircleHelp size={16} /><span>Help</span></button></div></header>
      {screen === "studio" && <section className="studio-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR SHORT-FORM STUDIO</div><h1>Make something <em>scroll-stopping.</em></h1><p>Pick a format, add an idea, and shape your next 8-10 second short.</p></div><button className="secondary-button export-button" onClick={exportCsv}><ArrowDownToLine size={16} /> Export spreadsheet</button></div>
        <div className="creator-layout">
          <div className="creator-form">
            <div className="form-section"><div className="section-title"><span className="step-number">01</span><div><h2>Choose your format</h2><p>What kind of moment are we making?</p></div></div>
              <div className="format-grid">{formats.map(({ name, icon: Icon, tone, detail }) => <button key={name} onClick={() => setSelectedFormat(name)} className={`format-option ${selectedFormat === name ? "selected" : ""}`}><span className={`format-icon ${tone}`}><Icon size={18} /></span><span className="format-copy"><strong>{name}</strong><small>{detail}</small></span>{selectedFormat === name && <Check className="format-check" size={16} />}</button>)}
                <button onClick={() => setSelectedFormat("Custom")} className={`format-option custom-option ${selectedFormat === "Custom" ? "selected" : ""}`}><span className="format-icon custom-tone"><Plus size={19} /></span><span className="format-copy"><strong>Something else</strong><small>Bring your own format</small></span>{selectedFormat === "Custom" && <Check className="format-check" size={16} />}</button>
              </div>
              {selectedFormat === "Custom" && <label className="field-label custom-field">Name your format<input value={customFormat} onChange={(event) => setCustomFormat(event.target.value)} placeholder="e.g. miniature pottery" maxLength={60} /></label>}
            </div>
            <div className="form-section brief-section"><div className="section-title"><span className="step-number">02</span><div><h2>Story direction (optional)</h2><p>Leave blank to have AI create a story from your selected settings.</p></div></div>
              <div style={{ padding: '4px 0 12px 37px' }}>
                <button onClick={buildPrompt} disabled={isBuildingPrompt} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '24px', border: '1px solid rgba(34, 197, 94, 0.2)', background: 'linear-gradient(145deg, #f0fdf4 0%, #e6fceb 100%)', color: '#15803d', fontSize: '12px', fontWeight: 650, cursor: isBuildingPrompt ? 'wait' : 'pointer', transition: 'all 0.2s ease', boxShadow: '0 2px 6px rgba(34,197,94,0.08), inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                  {isBuildingPrompt ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} color="#16a34a" fill="rgba(22, 163, 74, 0.2)" />}
                  {isBuildingPrompt ? 'Crafting prompt...' : 'Build with AI'}
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <label className="brief-wrap" style={{ display: 'block', marginTop: 0 }}>
                  <textarea value={ideaText} onChange={(event) => setIdeaText(event.target.value)} placeholder="A tiny glass garden growing in a raindrop..." />
                </label>
              </div>
              <div className="advanced-controls" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '16px', background: 'var(--paper)', padding: '20px', borderRadius: '14px', border: '1px solid var(--line)' }}>
                {/* Row 1: Timer + Num Images */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    ⏱ Video Duration
                    <select value={videoDuration} onChange={(e) => setVideoDuration(Number(e.target.value))} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '13px' }}>
                      <option value={0}>Select duration</option>
                      {[15, 30, 45, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    🖼 Number of Images
                    <select value={numImages} onChange={(e) => setNumImages(Number(e.target.value))} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '13px' }}>
                      <option value={0}>Select image count</option>
                      <option value={1}>1 Image</option>
                      <option value={3}>3 Images</option>
                      <option value={5}>5 Images</option>
                      <option value={7}>7 Images</option>
                      <option value={10}>10 Images</option>
                    </select>
                  </label>
                </div>

                {/* Image Style visual picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>🎨 Image Style</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {imageStylesOptions.map((s) => (
                      <StyleImageCard key={s.id} s={s} isSelected={imageStyle === s.id} onClick={() => setImageStyle(s.id)} />
                    ))}
                  </div>
                </div>

                {/* Caption Style visual picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>💬 Caption Style</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {captionStylesOptions.map((cs) => (
                      <div key={cs.id} onClick={() => setCaptionStyle(cs.id)} style={{ cursor: 'pointer', borderRadius: '10px', overflow: 'hidden', border: captionStyle === cs.id ? '2.5px solid #22c55e' : '2.5px solid transparent', boxShadow: captionStyle === cs.id ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 1px 4px rgba(0,0,0,0.12)', transition: 'all 0.2s' }}>
                        <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)', height: '60px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '8px' }}>
                          <span style={{ fontFamily: cs.preview.font, fontWeight: cs.preview.weight, textTransform: cs.preview.transform as any, background: cs.preview.bg, color: cs.preview.color, border: cs.preview.border, textShadow: cs.preview.shadow, padding: '3px 8px', borderRadius: '4px', fontSize: '11px', display: 'inline-block' }}>Story Caption</span>
                        </div>
                        <div style={{ padding: '6px 8px', background: captionStyle === cs.id ? '#f0fdf4' : '#fafaf9', textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', color: captionStyle === cs.id ? '#16a34a' : '#374151' }}>{cs.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Voice Type picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>🎙 Voice Type</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {voiceOptions.map((v) => (
                      <div key={v.id} onClick={() => setVoiceType(v.id)} style={{ cursor: 'pointer', borderRadius: '10px', border: voiceType === v.id ? '2.5px solid #22c55e' : '2.5px solid var(--line)', background: voiceType === v.id ? '#f0fdf4' : '#fff', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', boxShadow: voiceType === v.id ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none', transition: 'all 0.18s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '18px' }}>{v.emoji}</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); playDemoVoice(v.id); }} style={{ background: voiceType === v.id ? '#22c55e' : '#e5e7eb', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Play demo">
                            <Play size={10} fill={voiceType === v.id ? '#fff' : '#374151'} color={voiceType === v.id ? '#fff' : '#374151'} />
                          </button>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '12px', color: voiceType === v.id ? '#16a34a' : '#374151' }}>{v.label}</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{v.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  🌐 Narration Language
                  <select value={ttsLanguage} onChange={(e) => setTtsLanguage(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '13px' }}>
                    <option value="">Select language</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-AU">English (Australia)</option>
                    <option value="hi">Hindi — हिन्दी</option>
                    <option value="bn">Bengali — বাংলা</option>
                    <option value="es">Spanish — Español</option>
                    <option value="fr">French — Français</option>
                    <option value="ja">Japanese — 日本語</option>
                  </select>
                </label>
              </div>
              <section className="story-script-panel" style={{ marginTop: '18px', padding: '16px', border: '1px solid var(--line)', borderRadius: '6px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px' }}>AI story script</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '11px' }}>Review the narration before rendering your video.</p>
                  </div>
                  <button className="secondary-button" onClick={generateScript} disabled={isGeneratingScript}>
                    {isGeneratingScript ? <LoaderCircle className="spin" size={15} /> : generatedScript ? <RefreshCw size={15} /> : <WandSparkles size={15} />}
                    {isGeneratingScript ? "Generating script..." : generatedScript ? "Regenerate script" : "Generate script with AI"}
                  </button>
                </div>
                {generatedScript && generatedScriptContext !== getScriptContext() && <p role="status" style={{ margin: '12px 0 0', color: '#9a5b12', fontSize: '11px' }}>Your settings changed. Regenerate the script before creating the video.</p>}
                {generatedScript && <div style={{ marginTop: '14px', maxHeight: '280px', overflowY: 'auto', overflowWrap: 'anywhere' }}>
                  <strong style={{ fontSize: '13px' }}>{generatedScript.title}</strong>
                  <p style={{ margin: '5px 0 10px', color: 'var(--muted)', fontSize: '11px', lineHeight: 1.5 }}>{generatedScript.description}</p>
                  <ol style={{ margin: 0, paddingLeft: '20px' }}>
                    {generatedScript.scenes.map((scene, index) => <li key={`${index}-${scene.caption}`} style={{ padding: '4px 0', fontSize: '12px', lineHeight: 1.5 }}>{scene.caption}</li>)}
                  </ol>
                </div>}
              </section>
              <div className="prompt-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="primary-button" onClick={handleGenerateVideo} disabled={isGenerating}>
                  {isGenerating ? <LoaderCircle className="spin" size={16} /> : <Play size={16} fill="currentColor" />} 
                  {isGenerating ? "Working..." : "Generate video"} <ArrowRight size={15} />
                </button>
              </div>
              {isGenerating && (
                <div className="progress-container" style={{ marginTop: '20px', padding: '16px', background: 'var(--paper)', borderRadius: '12px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--green-dark)' }}>
                    <span>{generationStep}</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ height: '8px', background: '#e7e9e3', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--green)', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <aside className="preview-panel">
            <div className="preview-head"><div><span className="preview-kicker">YOUR CANVAS</span><h3>Shorts, in the making</h3></div><span className="preview-status"><span /> READY</span></div>
            <div className="phone-stage">
              <div className="phone-frame">
                <div className="phone-screen">
                  {(() => {
                    const selImg = imageStylesOptions.find(s => s.id === imageStyle);
                    const selCap = captionStylesOptions.find(c => c.id === captionStyle)?.preview;
                    return (
                      <>
                        <div className="phone-scene" style={{ backgroundImage: `url(${selImg?.img})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f3f4f6' }}></div>
                        <div className="phone-overlay">
                  <span className="phone-tag">{selectedFormat === "Custom" ? customFormat || "YOUR FORMAT" : selectedFormat ? selectedFormat.toUpperCase() : "CHOOSE FORMAT"}</span>
                          <div className="phone-play"><Play size={18} fill="currentColor" /></div>
                          <span className="phone-caption" style={selCap ? { fontFamily: selCap.font, fontWeight: selCap.weight, textTransform: selCap.transform as any, background: selCap.bg, color: selCap.color, border: selCap.border, textShadow: selCap.shadow, padding: '5px 10px', borderRadius: '4px', display: 'inline-block' } : {}}>A little wonder,<br />in a little loop.</span>
                          <div className="phone-side-icons"><span>♡</span><span>↗</span></div>
                        </div>
                      </>
                    );
                  })()}
                  <span className="phone-timer">{Math.floor(videoDuration / 60)}:{String(videoDuration % 60).padStart(2, "0")}</span>
                </div>
              </div>
            </div>
            <div className="preview-caption"><span className="preview-caption-icon"><Sparkles size={15} /></span><p><strong>Made for the replay.</strong><br />Every short starts with a tiny idea.</p></div>
            <div className="preview-bottom"><span><span className="quality-dot" /> Vertical format</span><span>9:16</span></div>
          </aside>
        </div>
        <div className="below-stats"><div><span className="stat-icon"><Clapperboard size={16} /></span><strong>{videos.length}</strong><span>shorts in your library</span></div><div><span className="stat-icon warm"><BarChart3 size={16} /></span><strong>8-10s</strong><span>made for quick attention</span></div><button onClick={() => setScreen("library")}>See your library <ArrowRight size={15} /></button></div>
      </section>}
      {screen === "library" && <section className="library-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR VIDEO LIBRARY</div><h1>Ideas, <em>in motion.</em></h1><p>Your saved history and videos completed in this session.</p></div><button className="secondary-button" onClick={exportCsv}><ArrowDownToLine size={16} /> Export spreadsheet</button></div>
      
      <div className="library-tabber" style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #e5e7eb', marginBottom: platformTab === "YouTube" ? '12px' : '24px', paddingBottom: '16px' }}>
        {["Self", ...(connections.includes("YouTube") ? ["YouTube"] : []), ...(connections.includes("Instagram") ? ["Instagram"] : []), ...(connections.includes("Facebook") ? ["Facebook"] : [])].map(tab => (
          <button 
            key={tab} 
            onClick={() => setPlatformTab(tab)}
            style={{
              background: platformTab === tab ? '#e3ffeb' : '#fff', 
              color: platformTab === tab ? '#166534' : '#666',
              border: platformTab === tab ? '1px solid #166534' : '1px solid #e5e7eb',
              fontWeight: 600, 
              cursor: 'pointer', 
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              transition: 'all 0.2s ease'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {platformTab === "YouTube" && (
        <div className="youtube-sub-tabber" style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
          {["Videos", "Shorts", "Posts"].map(subTab => (
            <button
              key={subTab}
              onClick={() => setYoutubeSubTab(subTab)}
              style={{
                background: 'none', border: 'none', 
                color: youtubeSubTab === subTab ? '#166534' : '#888',
                fontWeight: youtubeSubTab === subTab ? 600 : 400, 
                cursor: 'pointer', padding: 0,
                borderBottom: youtubeSubTab === subTab ? '2px solid #166534' : '2px solid transparent',
                paddingBottom: '6px',
                fontSize: '14px',
                transition: 'all 0.2s ease'
              }}
            >
              {subTab}
            </button>
          ))}
        </div>
      )}
      
      <div className="library-toolbar"><div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your videos" /></div><label className="filter-select"><span className="sr-only">Filter by format</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All videos</option>{formats.map((item) => <option key={item.name}>{item.name}</option>)}</select><ChevronDown size={15} /></label><span className="result-count">{filteredVideos.length} videos</span></div>{filteredVideos.length || isGeneratingInBackground ? <div className="video-grid">
  {isGeneratingInBackground && <article className="video-card"><div className="video-thumb" style={{ background: '#f5efdf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoaderCircle className="spin" size={24} style={{ color: '#888' }} /></div><div className="video-details"><h3>Generating AI Video...</h3><p>Your video is currently being generated in the background. It will automatically appear here once finished.</p><div className="video-card-actions"><span>Just now</span></div></div></article>}
  {filteredVideos.map((video) => <article className="video-card" key={video.id}>
    {video.status === 'failed' ? (
      <div className="video-thumb" style={{ background: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#d32f2f', fontWeight: 'bold' }}>FAILED</span></div>
    ) : (
      <div className="video-thumb video-thumb-preview">
        {video.videoUrl && !video.videoUrl.includes("youtube.com/") ? <video src={video.videoUrl} controls playsInline preload="metadata" aria-label={`Play ${video.title}`} onLoadedData={(event) => {
          const player = event.currentTarget;
          if (player.currentTime === 0 && Number.isFinite(player.duration) && player.duration > 0) player.currentTime = Math.min(0.1, player.duration / 2);
        }} /> : video.youtubeVideoId ? <a href={`https://youtube.com/shorts/${video.youtubeVideoId}`} target="_blank" rel="noreferrer" aria-label={`Watch ${video.title} on YouTube`} style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg)`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" }} /> : <span className="thumb-unavailable">Video preview unavailable</span>}
        <span className="thumb-tag">{video.format}</span>
      </div>
    )}
    <div className="video-details">
      <div className="video-type-label"><Film size={11} /> {video.format || "Short"}</div>
      <h3>{video.title}</h3>
      <p style={{ color: video.status === 'failed' ? '#d32f2f' : 'inherit' }}>{video.description}</p>
      {video.status !== 'failed' && <div className="hashtag-row">{video.hashtags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>}
      <div className="video-card-actions">
        <span>{video.createdAt}</span>
        <div style={{display:'flex', gap:'8px', marginLeft:'auto'}}>
        
        {video.youtubeVideoId && <a href={`https://youtube.com/shorts/${video.youtubeVideoId}`} target="_blank" rel="noreferrer" className="secondary-button" style={{padding:'4px 8px', fontSize:'11px', color: '#ff0000', borderColor: '#ff000033', backgroundColor: '#ff000011'}} title="Watch on YouTube">YouTube</a>}
        
        {video.shotstackUrl && <a href={video.shotstackUrl} target="_blank" rel="noreferrer" className="secondary-button" style={{padding:'4px 8px', fontSize:'11px'}} title="Shotstack version">Shotstack</a>}{video.json2videoUrl && <a href={video.json2videoUrl} target="_blank" rel="noreferrer" className="secondary-button" style={{padding:'4px 8px', fontSize:'11px'}} title="JSON2Video version">JSON2Video</a>}{!video.shotstackUrl && !video.json2videoUrl && video.videoUrl && !video.videoUrl.includes("youtube.com/") && <a href={video.videoUrl} download className="icon-button" title="Download video"><Download size={16} /></a>}
        <button className="icon-button" style={{ color: '#ea4335' }} onClick={() => setVideoToDelete(video)} title="Delete video"><Trash2 size={16} /></button>
        </div></div></div></article>)}</div> : <div className="empty-library"><div className="empty-art"><span /><span /><span /><Clapperboard size={27} /></div><h2>{query || filter !== "All videos" || platformTab !== "Self" ? "No matching media" : "Your next favorite starts here."}</h2><p>{query || filter !== "All videos" || platformTab !== "Self" ? "Try another search, format, or tab." : "Once your videos are generated, you'll find them here with their titles, descriptions, captions, hashtags, and links."}</p>{!query && filter === "All videos" && platformTab === "Self" && <button className="primary-button" onClick={() => setScreen("studio")}><Sparkles size={16} /> Create your first short</button>}</div>}</section>}
      {screen === "settings" && <section className="settings-content"><div className="eyebrow"><span className="eyebrow-dot" /> WORKSPACE SETTINGS</div><h1>Your studio, <em>your way.</em></h1><p className="settings-intro">Manage the connections that power your workflow.</p><div className="settings-row"><div className="settings-icon youtube-icon"><Play size={18} /></div><div className="settings-copy"><h2>YouTube publishing</h2><p>Connect YouTube OAuth to publish videos and manage titles, descriptions, and hashtags.</p></div><button className={`secondary-button ${connections.includes("YouTube") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("YouTube")}>{connections.includes("YouTube") ? "Disconnect" : "Connect"}</button></div><div className="settings-row"><div className="settings-icon" style={{ background: '#f5efdf', color: '#e1306c', borderRadius: '50%', padding: '8px', display: 'flex' }}><Camera size={18} /></div><div className="settings-copy"><h2>Instagram publishing</h2><p>Connect Instagram to automatically post Reels directly from your studio.</p></div><button className={`secondary-button ${connections.includes("Instagram") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("Instagram")}>{connections.includes("Instagram") ? "Disconnect" : "Connect"}</button></div><div className="settings-row"><div className="settings-icon" style={{ background: '#f5efdf', color: '#1877F2', borderRadius: '50%', padding: '8px', display: 'flex' }}><Users size={18} /></div><div className="settings-copy"><h2>Facebook publishing</h2><p>Connect Facebook to cross-post your shorts as Facebook Reels.</p></div><button className={`secondary-button ${connections.includes("Facebook") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("Facebook")}>{connections.includes("Facebook") ? "Disconnect" : "Connect"}</button></div><div className="settings-row"><div className="settings-icon" style={{ background: '#f5efdf', color: '#EA4335', borderRadius: '50%', padding: '8px', display: 'flex' }}><Mail size={18} /></div><div className="settings-copy"><h2>Gmail notifications</h2><p>Connect Gmail to receive email notifications.</p></div><button className={`secondary-button ${connections.includes("Gmail") ? 'disconnect' : ''}`} onClick={() => handleConnectionClick("Gmail")}>{connections.includes("Gmail") ? "Disconnect" : "Connect"}</button></div><div className="settings-note"><CircleHelp size={17} /><p>Firebase and AI Provider (Gemini) are securely configured via server environment variables.</p></div></section>}
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
            <button className="primary-button" style={{ flex: 1, background: '#ea4335', borderColor: '#ea4335' }} onClick={() => {
              const newConns = connections.filter(c => c !== disconnectingPlatform);
              setConnections(newConns);
              localStorage.setItem("app_connections", JSON.stringify(newConns));
              setDisconnectingPlatform(null);
              notify(`${disconnectingPlatform} disconnected.`);
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
            { (videoToDelete.youtubeVideoId || videoToDelete.facebookVideoId) && (
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
  return <main className="landing-page"><nav className="landing-nav"><a className="brand landing-brand" href="#top"><span className="brand-mark"><Play size={17} fill="currentColor" /></span><span>loop<span className="brand-dot">.</span></span></a><div className="landing-links"><a href="#how-it-works">How it works</a><a href="#formats">Formats</a></div><div className="landing-actions"><button className="text-button" onClick={onLogin}>Log in</button><button className="nav-cta" onClick={onStart}>Start creating <ArrowRight size={15} /></button></div></nav>
    <section className="landing-hero" id="top"><div className="hero-copy"><div className="hero-kicker"><span className="live-dot" /> THE LITTLE STUDIO FOR BIG IDEAS</div><h1>Your next short<br />starts with <em>a spark.</em></h1><p>Turn a tiny idea into a scroll-stopping 9-second story. Pick a vibe, shape the prompt, and make something worth replaying.</p><div className="hero-actions"><button className="hero-cta" onClick={onStart}>Make your first short <ArrowRight size={17} /></button><span className="hero-meta"><span className="hero-avatars"><i>J</i><i>M</i><i>A</i></span>Made for curious creators</span></div><div className="hero-proof"><span><Check size={14} /> Vertical-first ideas</span><span><Check size={14} /> Your style, your story</span></div></div><div className="hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="hero-poster poster-back"><span className="poster-label">TINY MOMENTS</span><div className="poster-flower"><i /><i /><i /><i /><i /><b /></div><span className="poster-bottom">somewhere<br />between seconds</span></div><div className="hero-poster poster-front"><div className="poster-image image-ceramic" /><div className="poster-gradient" /><span className="poster-topline">LOOP STUDIO <i>✳</i></span><span className="poster-caption">little things<br /><em>feel big.</em></span><span className="poster-play"><Play size={16} fill="currentColor" /></span><span className="poster-duration">0:09</span></div><div className="float-note note-top"><span><Sparkles size={15} /></span><div><strong>One little idea</strong><small>Endless ways to loop</small></div></div><div className="float-note note-bottom"><span className="note-music"><Music2 size={16} /></span><div><strong>Made to be replayed</strong><small>9 seconds · feels like more</small></div></div><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✳</span></div><div className="hero-scroll">SCROLL TO MAKE SOMETHING <span>↓</span></div></section>
    <section className="format-strip" id="formats"><div className="strip-label">A FORMAT FOR<br />EVERY LITTLE OBSESSION</div><div className="strip-items">{formats.slice(0, 6).map(({ name, icon: Icon, tone }) => <div className="strip-item" key={name}><span className={`format-icon ${tone}`}><Icon size={17} /></span><span>{name}</span></div>)}<div className="strip-item more-formats"><span className="format-icon custom-tone"><Plus size={17} /></span><span>And your own</span></div></div></section>
    <section className="how-section" id="how-it-works"><div className="how-heading"><div className="eyebrow"><span className="eyebrow-dot" /> FROM SPARK TO SHORT</div><h2>A tiny process.<br /><em>A whole lot of possibility.</em></h2></div><div className="how-steps"><article><span className="how-number">01</span><span className="how-icon icon-pick"><Film size={20} /></span><h3>Pick a feeling</h3><p>ASMR, mini stories, nature, or the niche only you could dream up.</p></article><article><span className="how-number">02</span><span className="how-icon icon-shape"><Sparkles size={20} /></span><h3>Shape the idea</h3><p>Bring a thought. We&apos;ll help turn it into a short-form video prompt.</p></article><article><span className="how-number">03</span><span className="how-icon icon-loop"><Play size={20} /></span><h3>Make it a loop</h3><p>Keep your shorts, captions, and creative details together in one studio.</p></article></div></section>
    <section className="landing-end"><span className="end-star">✳</span><div className="eyebrow">THE NEXT NINE SECONDS ARE YOURS</div><h2>What will you <em>make loop?</em></h2><button className="hero-cta" onClick={onStart}>Start your studio <ArrowRight size={17} /></button><p>Free to explore · Your ideas stay yours</p></section><footer className="landing-footer"><a className="brand landing-brand" href="#top"><span className="brand-mark"><Play size={15} fill="currentColor" /></span><span>loop<span className="brand-dot">.</span></span></a><span>A little studio for the next big thing.</span><span>© 2026 loop studio</span></footer></main>;
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

