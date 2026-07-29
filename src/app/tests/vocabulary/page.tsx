import { CategoryHeader } from "@/components/tests/CategoryHeader";
import { CategoryTests } from "@/components/tests/CategoryTests";

export default function VocabularyTestsPage() {
  return (
    <div className="space-y-6">
      <CategoryHeader group="Vocabulary Tests" />
      <CategoryTests group="Vocabulary Tests" />
    </div>
  );
}
