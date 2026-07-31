import type { Metadata } from "next";
import { AdminDashboard } from "./admin-dashboard";

export const metadata: Metadata = {
  title: "Quản trị",
  description: "Quản lý vòng quay, phần thưởng, mã tham gia và kết quả.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
