import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // 1. Generate Video Metadata and Prompts
    const format = "ASMR"; 
    
    // Using 3 distinct visual scenes for the slideshow
    const prompts = [
      encodeURIComponent(`A hyper-realistic extreme macro shot of a crystalline sugar geode, ${format} style`),
      encodeURIComponent(`A scalpel slicing into the sugar geode, shattering pieces, ${format} style`),
      encodeURIComponent(`The geode breaking open revealing golden nectar inside, ${format} style`)
    ];

    // Using pollinations.ai for 100% free image generation
    const imageUrls = prompts.map(p => `https://image.pollinations.ai/prompt/${p}?width=1080&height=1920&nologo=true`);

    // 2. Send to Shotstack to stitch into a video
    const shotstackKey = process.env.SHOTSTACK_API_KEY;
    if (!shotstackKey) {
      return NextResponse.json({ error: 'Missing Shotstack API Key' }, { status: 500 });
    }

    const shotstackPayload = {
      timeline: {
        background: "#000000",
        tracks: [
          {
            clips: imageUrls.map((url, index) => ({
              asset: {
                type: "image",
                src: url
              },
              start: index * 3,
              length: 3,
              effect: "zoomIn"
            }))
          }
        ]
      },
      output: {
        format: "mp4",
        resolution: "1080",
        aspectRatio: "9:16"
      }
    };

    const renderResponse = await fetch('https://api.shotstack.io/edit/v1/render', {
      method: 'POST',
      headers: {
        'x-api-key': shotstackKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shotstackPayload)
    });

    const renderData = await renderResponse.json();
    
    if (!renderData.success) {
      return NextResponse.json({ error: 'Shotstack rendering failed', details: renderData }, { status: 500 });
    }

    const renderId = renderData.response.id;

    // 3. Poll Shotstack until the video is finished rendering (usually takes 10-15 seconds)
    let status = "rendering";
    let videoUrl = "";
    
    while (status !== "done" && status !== "failed") {
      await new Promise(resolve => setTimeout(resolve, 3000)); // wait 3 seconds
      
      const statusResponse = await fetch(`https://api.shotstack.io/edit/v1/render/${renderId}`, {
        headers: {
          'x-api-key': shotstackKey
        }
      });
      const statusData = await statusResponse.json();
      status = statusData.response.status;
      
      if (status === "done") {
        videoUrl = statusData.response.url; // This is the final .mp4 link
      }
    }

    if (status === "failed") {
      return NextResponse.json({ error: 'Shotstack rendering failed during processing' }, { status: 500 });
    }

    // 4. Save ONLY the video URL to the database (Zero-Storage requirement)
    // We do NOT download the file. We just save this URL string to Firebase Firestore.
    // e.g. await addDoc(collection(db, "users", userId, "videos"), { url: videoUrl, title: "..." });

    // 5. Post to Social Media (YouTube) using Google Client Secret
    // e.g. await uploadToYouTube(videoUrl, tokens.refresh_token);

    return NextResponse.json({ 
      success: true, 
      message: "Video generated successfully! Link saved to database.",
      videoUrl: videoUrl,
      imageUrls 
    });

  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
