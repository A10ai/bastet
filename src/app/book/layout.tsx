import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book your stay",
  description: "Check availability and book serviced apartments directly, at the best rate.",
};

/** Public booking pages: no dashboard chrome, mobile first. */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-brand-bg text-text-primary">{children}</div>;
}
