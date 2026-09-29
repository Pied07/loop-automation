import { inngest } from "./client";
import { generateVideoContent, renderVideo, publishToSocials, generateContinuationScript, mergeVideos } from "@/app/actions";

type RenderSuccess = { failed?: false; videoUrl: string; shotstackUrl: string; json2videoUrl: string };
type RenderFailure = { failed: true; error: string };
type RenderResult = RenderSuccess | RenderFailure;

export const generateVideoJob = inngest.createFunction(
  { id: "generate-video", triggers: [{ event: "video/generate" }] },
  async ({ event, step }) => {
    const { prompt, script, format, userId, connections, userEmail, idToken, videoDuration, numImages, imageStyle, ttsLanguage, captionStyle, voiceType } = event.data;

    // 1. Generate Metadata
    const metadata = await step.run("generate-script", async () => {
      if (script?.scenes?.length === numImages) return script;
      const res = await generateVideoContent(prompt, format, numImages, videoDuration);
      if ('error' in res) throw new Error(res.error as string);
      return res;
    });
    metadata.hashtags = ensureVideoHashtags(metadata.hashtags, `${metadata.title} ${metadata.description} ${prompt} ${format}`);

    // 2. Render through short durable steps; the whole workflow may take longer than one Vercel invocation.
    const renderRuntime = {
      run: <T>(id: string, operation: () => Promise<T>) => step.run(`render-${id}`, operation),
      sleep: (id: string, duration: string) => step.sleep(`render-${id}`, duration),
    };
    const renderOutput = await renderVideo(metadata.scenes, videoDuration, imageStyle, ttsLanguage, captionStyle, idToken, userId, voiceType || "Adam", renderRuntime);
    const renderResult: RenderResult = "error" in renderOutput
      ? { failed: true, error: String(renderOutput.error) }
      : { ...renderOutput, failed: false };

    if (renderResult.failed) {
      return { success: false, error: renderResult.error };
    }

    // TypeScript now knows renderResult is RenderSuccess here
    const successResult = renderResult;

    // 3. Publish to Socials
    const deliveryLogs: string[] = [];
    const deliveryErrors: string[] = [];
    let youtubeVideoId = "";
    let facebookVideoId = "";
    let instagramVideoId = "";
    const deliver = async (platform: string, stepId: string) => {
      const result = await step.run(stepId, async () => {
        try {
          return await publishToSocials(successResult.videoUrl || "", metadata.title, [platform], userEmail, metadata.hashtags, metadata.description);
        } catch (err: any) {
          console.error("Social publish failed (non-fatal):", err.message);
          return { error: err.message };
        }
      });
      if ("error" in result) return { error: String(result.error), logs: [] as string[] };
      return { logs: result.logs, youtubeVideoId: result.youtubeVideoId, facebookVideoId: result.facebookVideoId, instagramVideoId: result.instagramVideoId };
    };

    if (connections?.includes("YouTube")) {
      const youtubeResult = await deliver("YouTube", "publish-youtube");
      deliveryLogs.push(...(youtubeResult.logs || []));
      youtubeVideoId = youtubeResult.youtubeVideoId || "";
      if (youtubeResult.error) deliveryErrors.push(`YouTube: ${youtubeResult.error}`);
    }

    if (connections?.includes("Facebook")) {
      const fbResult = await deliver("Facebook", "publish-facebook");
      deliveryLogs.push(...(fbResult.logs || []));
      facebookVideoId = fbResult.facebookVideoId || "";
      if (fbResult.error) deliveryErrors.push(`Facebook: ${fbResult.error}`);
    }

    if (connections?.includes("Instagram")) {
      const igResult = await deliver("Instagram", "publish-instagram");
      deliveryLogs.push(...(igResult.logs || []));
      instagramVideoId = igResult.instagramVideoId || "";
      if (igResult.error) deliveryErrors.push(`Instagram: ${igResult.error}`);
    }

    if (connections?.includes("Gmail")) {
      const emailResult = await deliver("Gmail", "email-video-link");
      deliveryLogs.push(...(emailResult.logs || []));
      if (emailResult.error) deliveryErrors.push(`Gmail: ${emailResult.error}`);
    }

    const deliveryMessage = deliveryErrors.length
      ? `Video is ready. ${deliveryErrors.join("; ")}`
      : deliveryLogs.join("; ") || "No supported account was connected; the link is available in this session's library.";

    return {
      success: true,
      deliveryMessage,
      video: {
        title: metadata.title,
        description: metadata.description,
        captions: metadata.captions,
        hashtags: metadata.hashtags,
        videoUrl: successResult.videoUrl || "",
        shotstackUrl: successResult.shotstackUrl || "",
        json2videoUrl: successResult.json2videoUrl || "",
        youtubeVideoId,
        facebookVideoId,
        instagramVideoId,
        format,
        createdAt: new Date().toISOString().split("T")[0],
        status: "completed" as const
      }
    };
  }
);

function ensureVideoHashtags(hashtags: unknown, context: string): string[] {
  const normalize = (value: string) => `#${value.replace(/^#+/, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()}`;
  const tags = Array.isArray(hashtags)
    ? hashtags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map(normalize)
    : [];
  const excluded = new Set(["about", "after", "again", "also", "and", "are", "before", "being", "could", "from", "have", "into", "more", "most", "that", "their", "there", "these", "this", "through", "very", "with", "your"]);
  const words = context.match(/[\p{L}\p{N}]{3,}/gu) || [];
  const topical = words.map(normalize).filter((tag) => !excluded.has(tag.slice(1)));
  const general = ["#shorts", "#storytelling", "#shortstory", "#originalstory", "#cinematic", "#storytime", "#aivideo", "#creativevideo", "#narrativestory", "#viralshorts"];
  for (const tag of [...topical, ...general]) {
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length >= 10) break;
  }
  return tags.slice(0, 15);
}

export const extendVideoJob = inngest.createFunction(
  { id: "extend-video", triggers: [{ event: "video/extend" }] },
  async ({ event, step }) => {
    const { userId, idToken, extendBySeconds, originalPrompt, originalCaptions, format, imageStyle, ttsLanguage, captionStyle, voiceType, originalVideoUrl } = event.data;

    const chunksNeeded = Math.ceil(extendBySeconds / 15);
    const videoUrls = [originalVideoUrl];
    let currentCaptions = originalCaptions;

    for (let i = 0; i < chunksNeeded; i++) {
      const chunkDuration = Math.min(15, extendBySeconds - (i * 15));
      const numImages = Math.max(3, Math.floor(chunkDuration / 3));

      const metadata = await step.run("generate-chunk-script-" + i, async () => {
        const res = await generateContinuationScript(originalPrompt, currentCaptions, format, numImages, chunkDuration);
        if ('error' in res) throw new Error(res.error as string);
        return res;
      });

      const chunkRuntime = {
        run: <T>(id: string, operation: () => Promise<T>) => step.run(`chunk-${i}-render-${id}`, operation),
        sleep: (id: string, duration: string) => step.sleep(`chunk-${i}-render-${id}`, duration),
      };
      const renderOutput = await renderVideo(metadata.scenes, chunkDuration, imageStyle, ttsLanguage, captionStyle, idToken, userId, voiceType, chunkRuntime);
      const renderResult = "error" in renderOutput
        ? { failed: true, error: String(renderOutput.error), url: "" }
        : { failed: false, error: "", url: renderOutput.videoUrl };

      if (renderResult.failed) throw new Error("Chunk " + i + " failed: " + renderResult.error);
      if (renderResult.url) {
        videoUrls.push(renderResult.url);
      }
      currentCaptions += " " + metadata.captions;
    }

    const mergeResult = await step.run("merge-video-chunks", async () => {
      const res = await mergeVideos(videoUrls);
      if ('error' in res) throw new Error(res.error as string);
      return res;
    });

    return {
      success: true,
      deliveryMessage: "Extended video is ready. Its link is available in this session's library.",
      video: {
        title: format + " (Extended)",
        description: "Extended version. Original: " + originalPrompt,
        captions: currentCaptions,
        hashtags: ["shorts", format.replace(/\s+/g, "").toLowerCase(), "extended"],
        videoUrl: mergeResult.url || "",
        format,
        createdAt: new Date().toISOString().split("T")[0],
        status: "completed" as const
      }
    };
  }
);
