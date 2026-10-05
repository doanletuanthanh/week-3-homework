import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "vietnamese"], variable: "--font-jakarta" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "InterviewLab · Luyện phỏng vấn người dùng",
  description: "Luyện phỏng vấn người dùng với một nhân vật AI và xem chính xác bạn đã bỏ lỡ điều gì.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${newsreader.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
