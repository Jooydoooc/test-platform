import { CategoryHeader } from "@/components/tests/CategoryHeader";
import { CategoryTests } from "@/components/tests/CategoryTests";
import { TestNav } from "@/components/tests/TestNav";

export default function GrammarTestsPage() {
  return (
    <div className="space-y-6">
      <CategoryHeader group="Grammar Tests" />
      <TestNav />
      <CategoryTests group="Grammar Tests" />
    </div>
  );
}
