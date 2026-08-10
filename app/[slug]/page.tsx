import type { Metadata } from "next";
import { WheelExperience } from "./wheel-experience";

export const metadata: Metadata = {
  title: "Tham gia vòng quay",
  description: "Quay ngay và khám phá phần thưởng của bạn.",
};

export default async function WheelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <WheelExperience slug={slug} />;
}
