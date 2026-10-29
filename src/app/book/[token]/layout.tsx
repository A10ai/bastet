import type { Metadata } from "next";

/** The token page is private to one booking: never indexed. */
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

export default function BookTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
