import { Inngest } from "inngest";

if (process.env.NODE_ENV === "development") {
  process.env.INNGEST_EVENT_KEY = "local";
  process.env.INNGEST_BASE_URL = "http://127.0.0.1:8288";
  process.env.INNGEST_DEV = "1";
}

// Create a client to send and receive events
export const inngest = new Inngest({ 
  id: "youtube-automation"
});
