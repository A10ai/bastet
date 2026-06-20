"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * GDPR Cookie Consent Banner
 *
 * Shows on first visit, asks for consent for non-essential cookies.
 * Stores consent in localStorage (no cookie needed for this).
 * Three options: Accept all, Reject non-essential, Customize.
 *
 * UK GDPR requires: clear consent, ability to withdraw, granular control.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [preferences, setPreferences] = useState({
    necessary: true, // Always true — cannot be disabled
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if consent already given
    const consent = localStorage.getItem("hospitai_cookie_consent");
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptAll = () => {
    const consent = {
      necessary: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("hospitai_cookie_consent", JSON.stringify(consent));
    setShow(false);
  };

  const rejectNonEssential = () => {
    const consent = {
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("hospitai_cookie_consent", JSON.stringify(consent));
    setShow(false);
  };

  const savePreferences = () => {
    const consent = {
      ...preferences,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("hospitai_cookie_consent", JSON.stringify(consent));
    setShow(false);
    setShowCustomize(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-bastet-card border-t border-bastet-border shadow-lg"
    >
      <div className="max-w-4xl mx-auto">
        {!showCustomize ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 text-sm text-text-secondary">
              We use cookies for essential functions (authentication, session management) and optional purposes
              (analytics, marketing). By clicking &quot;Accept all&quot;, you consent to all cookies.
              See our <Link href="/privacy" className="text-bastet-gold underline">Privacy Policy</Link>.
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={rejectNonEssential}
                className="px-4 py-2 text-sm rounded-lg border border-bastet-border text-text-secondary hover:bg-bastet-bg transition-colors"
              >
                Reject non-essential
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="px-4 py-2 text-sm rounded-lg border border-bastet-border text-text-secondary hover:bg-bastet-bg transition-colors"
              >
                Customize
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 text-sm rounded-lg bg-bastet-gold text-bastet-bg font-medium hover:opacity-90 transition-opacity"
              >
                Accept all
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm font-medium text-text-primary">Customize cookie preferences:</div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-not-allowed opacity-60">
                <input type="checkbox" checked disabled className="rounded" />
                <span className="text-sm text-text-secondary">
                  <strong>Essential</strong> — Authentication, session management (required)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.analytics}
                  onChange={(e) => setPreferences((p) => ({ ...p, analytics: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-text-secondary">
                  <strong>Analytics</strong> — Usage statistics, performance monitoring
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.marketing}
                  onChange={(e) => setPreferences((p) => ({ ...p, marketing: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-text-secondary">
                  <strong>Marketing</strong> — Personalized content, promotional emails
                </span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={savePreferences}
                className="px-4 py-2 text-sm rounded-lg bg-bastet-gold text-bastet-bg font-medium hover:opacity-90 transition-opacity"
              >
                Save preferences
              </button>
              <button
                onClick={() => setShowCustomize(false)}
                className="px-4 py-2 text-sm rounded-lg border border-bastet-border text-text-secondary hover:bg-bastet-bg transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}