import { CategoryHeader } from "@/components/tests/CategoryHeader";
import { CategoryTests } from "@/components/tests/CategoryTests";
import { TestNav } from "@/components/tests/TestNav";

export default function ReadingTestsPage() {
  return (
    <div className="space-y-6">
      <CategoryHeader group="Reading Tests" />
      <TestNav />
      <CategoryTests group="Reading Tests" />
    </div>
  );
}
