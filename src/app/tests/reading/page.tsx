import { CategoryHeader } from "@/components/tests/CategoryHeader";
import { CategoryTests } from "@/components/tests/CategoryTests";

export default function ReadingTestsPage() {
  return (
    <div className="space-y-6">
      <CategoryHeader group="Reading Tests" />
      <CategoryTests group="Reading Tests" />
    </div>
  );
}
