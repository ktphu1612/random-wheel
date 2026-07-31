import type { Metadata } from "next";
import { Be_Vietnam_Pro, Fraunces } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    title: {
      default: "Quay Vui — Vòng quay trúng thưởng",
      template: "%s | Quay Vui",
    },
    description:
      "Tạo nhiều vòng quay, quản lý xác suất, kho quà và lượt quay theo từng người.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Quay Vui — Mỗi lượt quay, một niềm vui thật",
      description:
        "Nền tảng vòng quay trúng thưởng nhiều chiến dịch, kiểm soát kho quà và xác suất.",
      locale: "vi_VN",
      type: "website",
      images: [{ url: "/og.png", width: 1734, height: 907, alt: "Quay Vui" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Quay Vui — Mỗi lượt quay, một niềm vui thật",
      description: "Tạo vòng quay, kiểm soát kho quà và xác suất.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${display.variable}`}>
        {children}
      </body>
    </html>
  );
}
