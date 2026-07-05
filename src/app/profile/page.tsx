import { redirect } from "next/navigation";

// Profile and dashboard are merged into a single page at /dashboard.
export default function ProfilePage() {
  redirect("/dashboard");
}
