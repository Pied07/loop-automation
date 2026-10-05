import Link from "next/link";
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle, ShieldCheck, Mail } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions | The Viral Desk",
  description: "Terms and Conditions of service for The Viral Desk.",
};

export default function TermsPage() {
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
          <Link href="/privacy" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>
            Privacy Policy
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
        {/* Title Section */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#ff3b45", fontSize: "11px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>
            <FileText size={14} /> LEGAL AGREEMENT
          </div>
          <h1 style={{ fontSize: "clamp(30px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-1px", margin: "0 0 12px", color: "#ffffff" }}>
            Terms and Conditions
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>
            Last Updated: <strong>October 2026</strong> · Please review carefully before using our platform
          </p>
        </div>

        {/* Highlights Box */}
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
            <ShieldCheck size={16} color="#ff3b45" /> Summary of Important Terms:
          </div>
          <div style={{ display: "grid", gap: "8px", fontSize: "13px", color: "#cbd5e1" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>You retain full intellectual property ownership of your content.</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>You are responsible for ensuring you have adequate rights and licenses for videos you choose to repurpose.</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>You agree to comply with third-party policies (YouTube Terms of Service, Meta Community Standards).</span>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: "grid", gap: "34px", fontSize: "14px", lineHeight: "1.7", color: "#cbd5e1" }}>
          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>1. Acceptance of Terms</h2>
            <p>
              By accessing or using The Viral Desk website, software tools, API integrations, and related applications (collectively, the &quot;Service&quot;), you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>2. Description of the Service</h2>
            <p>
              The Viral Desk is an automated workflow utility designed to assist content creators in segmenting video content, attaching branded outros, creating social descriptions and hashtags, and distributing short-form clips directly to connected social media platforms including YouTube Shorts, Instagram Reels, and Facebook Reels.
            </p>
          </section>

          <section style={{
            padding: "24px",
            background: "rgba(229, 9, 20, 0.05)",
            border: "1px solid rgba(229, 9, 20, 0.25)",
            borderRadius: "12px",
          }}>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ff4d56", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={18} /> 3. User Content &amp; Copyright Compliance
            </h2>
            <p style={{ color: "#e2e8f0" }}>
              As a user of The Viral Desk, you are solely responsible for all video clips, audio tracks, text descriptions, and titles processed through your account:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px", marginTop: "8px", color: "#e2e8f0" }}>
              <li>
                You affirm that you own or possess the necessary rights, licenses, consents, and permissions to use and authorize The Viral Desk to process and post your submitted media.
              </li>
              <li>
                You must not use the Service to infringe upon copyrights, trademarks, privacy rights, or other proprietary rights of any third party.
              </li>
              <li>
                You agree not to upload or distribute content that is defamatory, obscene, harassing, hateful, or in violation of applicable laws.
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>4. Third-Party Platform Policies</h2>
            <p>
              When utilizing our publishing features, you agree to be bound by the terms and policies of each respective destination platform:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px", marginTop: "8px" }}>
              <li>
                <strong>YouTube:</strong> By connecting YouTube, you agree to the{" "}
                <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" style={{ color: "#ff4d56", textDecoration: "underline" }}>
                  YouTube Terms of Service
                </a>{" "}
                and the{" "}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" style={{ color: "#ff4d56", textDecoration: "underline" }}>
                  Google Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Meta Platforms:</strong> By publishing to Facebook or Instagram, you agree to the{" "}
                <a href="https://www.facebook.com/legal/terms" target="_blank" rel="noreferrer" style={{ color: "#ff4d56", textDecoration: "underline" }}>
                  Meta Terms of Service
                </a>{" "}
                and{" "}
                <a href="https://help.instagram.com/581066165581870" target="_blank" rel="noreferrer" style={{ color: "#ff4d56", textDecoration: "underline" }}>
                  Instagram Community Guidelines
                </a>.
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>5. Intellectual Property Rights</h2>
            <p>
              <strong>Your Content:</strong> You retain 100% of your ownership rights in your videos and clips. The Viral Desk does not assert any ownership claim over user-created content.
            </p>
            <p style={{ marginTop: "8px" }}>
              <strong>Platform IP:</strong> The Viral Desk brand, logos, software interface, designs, code, and documentation are protected by copyright and intellectual property laws and remain the exclusive property of The Viral Desk.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>6. Limitation of Liability &amp; Disclaimers</h2>
            <p>
              The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, whether express or implied. The Viral Desk does not guarantee that third-party APIs (Google, Meta) will remain uninterrupted or error-free. In no event shall The Viral Desk be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the platform.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>7. Termination &amp; Disconnection</h2>
            <p>
              You may terminate your connection or account at any time by disconnecting your third-party accounts in Workspace Settings or ceasing use of the Service. We reserve the right to suspend access to users who violate these Terms or abuse platform infrastructure.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#ffffff", marginBottom: "10px" }}>8. Contact Information</h2>
            <p>
              For inquiries regarding these Terms and Conditions, reach out to our team:
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
          <Link href="/terms" style={{ color: "#ff3b45", textDecoration: "none", fontWeight: 700 }}>Terms &amp; Conditions</Link>
          <Link href="/privacy" style={{ color: "#94a3b8", textDecoration: "none" }}>Privacy Policy</Link>
        </div>
        <div>&copy; 2026 The Viral Desk. All rights reserved.</div>
      </footer>
    </div>
  );
}
