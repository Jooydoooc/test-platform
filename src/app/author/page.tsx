import { redirect } from "next/navigation";

// Test management now lives in the admin panel. Keep this route as a permanent
// redirect so existing links/bookmarks still resolve.
export default function AuthorPage() {
  redirect("/admin/tests");
}
