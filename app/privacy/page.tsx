import Link from "next/link";
import { ArrowLeft, Shield, Lock, Eye, Database, Share2, Mail, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | The Viral Desk",
  description: "Privacy Policy and Google API User Data compliance disclosure for The Viral Desk.",
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#08080c", color: "#f8fafc", fontFamily: "var(--font-sans), sans-serif" }}>
      {/* Header */}
      <header style={{
        height: "70px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 clamp(20px, 6vw, 120px)",
        borderBottom: "1px solid #1a1c26",
        background: "rgba(10, 11, 16, 0.85)",
        backdropFilter: "blur(14px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "#fff", fontWeight: 800, fontSize: "19px" }}>
          <img
            src="/assets/theme.png"
            alt="The Viral Desk"
            style={{ height: "36px", width: "36px", borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 12px rgba(229,9,20,0.4)" }}
          />
          <span>The Viral Desk</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Link href="/terms" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>
            Terms &amp; Conditions
          </Link>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(135deg, #e50914 0%, #b20710 100%)",
              textDecoration: "none",
              boxShadow: "0 2px 10px rgba(229,9,20,0.35)",
            }}
          >
            <ArrowLeft size={14} /> Back to Studio
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "50px 24px 80px" }}>
        {/* Hero Title */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#ff3b45", fontSize: "11px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>
            <Shield size={14} /> LEGAL &amp; COMPLIANCE
          </div>
          <h1 style={{ fontSize: "clamp(30px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-1px", margin: "0 0 12px", color: "#ffffff" }}>
            Privacy Policy
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>
            Last Updated: <strong>October 2026</strong> · Effective immediately
          </p>
        </div>

        {/* Quick Highlights Box */}
        <div style={{
          padding: "20px 24px",
          background: "#111218",
          border: "1px solid #1f2230",
          borderRadius: "12px",
          marginBottom: "40px",
          display: "grid",
          gap: "12px",
        }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#ffffff", display: "flex", alignItems: "center", gap: "8px" }}>
            <Lock size={16} color="#ff3b45" /> Summary of Key Commitments:
          </div>
          <div style={{ display: "grid", gap: "8px", fontSize: "13px", color: "#cbd5e1" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>We never sell your personal information or content to third parties.</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>Google and Meta user data is accessed strictly to post videos and send notifications per your direct instructions.</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>Temporary processing files are cleared automatically from server storage once published.</span>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: "grid", gap: "34px", fontSize: "14px", lineHeight: "1.7", color: "#cbd5e1" }}>
          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>1. Introduction</h2>
            <p>
              The Viral Desk (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides an automated vertical clip repurposing and social distribution studio. This Privacy Policy describes how we collect, use, and handle your information when you use our website, tools, and connected services (the &quot;Service&quot;).
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>2. Information We Collect</h2>
            <p>We collect information necessary to operate, generate clips, and connect to your chosen social media channels:</p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px", marginTop: "8px" }}>
              <li>
                <strong style={{ color: "#fff" }}>Account Credentials:</strong> If you create an account, we store your email address and display name via Firebase Authentication to maintain your workspace state and video library.
              </li>
              <li>
                <strong style={{ color: "#fff" }}>User-Provided Media:</strong> Video URLs submitted for splitting, auto-generated title metadata, hashtags, and exported clip details.
              </li>
              <li>
                <strong style={{ color: "#fff" }}>Connected Platform Tokens:</strong> OAuth authorization tokens for YouTube, Instagram, Facebook, and Gmail when you choose to connect these integrations in Settings.
              </li>
            </ul>
          </section>

          <section style={{
            padding: "24px",
            background: "rgba(229, 9, 20, 0.05)",
            border: "1px solid rgba(229, 9, 20, 0.25)",
            borderRadius: "12px",
          }}>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ff4d56", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Eye size={18} /> 3. Google API Services &amp; Limited Use Disclosure
            </h2>
            <p style={{ color: "#e2e8f0" }}>
              The Viral Desk accesses Google API services when you connect YouTube and Gmail:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px", marginTop: "8px", color: "#e2e8f0" }}>
              <li>
                <strong>YouTube Data API v3:</strong> Used exclusively to upload generated viral video clips to your YouTube channel as Shorts and to manage videos published through our platform upon your explicit command.
              </li>
              <li>
                <strong>Gmail API:</strong> Used solely to send status reports and published clip URLs directly to your authorized email address. We do not read, parse, or store your inbox emails.
              </li>
            </ul>
            <p style={{ marginTop: "14px", fontStyle: "italic", color: "#f1f5f9" }}>
              <strong>Google Limited Use Requirements:</strong> The Viral Desk&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#ff4d56", textDecoration: "underline" }}
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>4. Meta Platform Data (Facebook &amp; Instagram)</h2>
            <p>
              When you connect your Instagram and Facebook accounts, we request permissions under Meta Graph API (such as <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_show_list</code>, and <code>pages_read_engagement</code>) strictly for the purpose of publishing video clips and Reels to your accounts. We do not inspect personal feeds or harvest private messages.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>5. How We Use Information</h2>
            <p>Information collected is used solely to:</p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "6px", marginTop: "8px" }}>
              <li>Process, slice, and append video outros to your designated video clips.</li>
              <li>Auto-generate hashtags, descriptions, and metadata for short-form publishing.</li>
              <li>Upload clips directly to your selected channels (YouTube, Instagram, Facebook).</li>
              <li>Deliver publication confirmations via Gmail.</li>
              <li>Store your clips library within your private workspace.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>6. Data Retention &amp; Local Storage Cleanup</h2>
            <p>
              Temporary video slices created during ffmpeg processing are purged immediately following publication to optimize disk space and prevent unauthorized access. User metadata saved in your library can be deleted anytime directly from the &quot;My videos&quot; screen. You can disconnect any platform in Workspace Settings at any moment.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>7. Security</h2>
            <p>
              We implement industry-standard encryption protocols (HTTPS/TLS) for data in transit and follow OAuth 2.0 authentication standards for all third-party platform connections. Client secrets and tokens are securely managed.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>8. Contact Us</h2>
            <p>
              If you have any questions, feedback, or data requests regarding this Privacy Policy, please contact our support desk:
            </p>
            <div style={{ marginTop: "10px", padding: "14px 18px", background: "#111218", border: "1px solid #1f2230", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "10px" }}>
              <Mail size={16} color="#ff3b45" />
              <span>Email: <strong style={{ color: "#fff" }}>loop.automation.07@gmail.com</strong></span>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        minHeight: "75px",
        padding: "20px clamp(20px, 6vw, 120px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid #161822",
        background: "#07080a",
        fontSize: "12px",
        color: "#64748b",
        flexWrap: "wrap",
        gap: "14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/assets/theme.png" alt="The Viral Desk" style={{ height: "26px", width: "26px", borderRadius: "50%" }} />
          <span style={{ color: "#cbd5e1", fontWeight: 700 }}>The Viral Desk</span>
        </div>
        <div style={{ display: "flex", gap: "18px", alignItems: "center" }}>
          <Link href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>Studio</Link>
          <Link href="/terms" style={{ color: "#94a3b8", textDecoration: "none" }}>Terms &amp; Conditions</Link>
          <Link href="/privacy" style={{ color: "#ff3b45", textDecoration: "none", fontWeight: 700 }}>Privacy Policy</Link>
        </div>
        <div>&copy; 2026 The Viral Desk. All rights reserved.</div>
      </footer>
    </div>
  );
}
