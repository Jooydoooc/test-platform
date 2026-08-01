import { CategoryHeader } from "@/components/tests/CategoryHeader";
import { CategoryTests } from "@/components/tests/CategoryTests";
import { TestNav } from "@/components/tests/TestNav";

export default function VocabularyTestsPage() {
  return (
    <div className="space-y-6">
      <CategoryHeader group="Vocabulary Tests" />
      <TestNav />
      <CategoryTests group="Vocabulary Tests" />
    </div>
  );
}
