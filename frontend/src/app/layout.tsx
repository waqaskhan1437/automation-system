import type { Metadata } from "next";
import "../styles/globals.css";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Automation System",
  description: "Social Media Automation System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0f] text-[#e4e4e7] min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-8 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
