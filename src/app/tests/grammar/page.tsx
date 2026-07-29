import { CategoryHeader } from "@/components/tests/CategoryHeader";
import { CategoryTests } from "@/components/tests/CategoryTests";

export default function GrammarTestsPage() {
  return (
    <div className="space-y-6">
      <CategoryHeader group="Grammar Tests" />
      <CategoryTests group="Grammar Tests" />
    </div>
  );
}
