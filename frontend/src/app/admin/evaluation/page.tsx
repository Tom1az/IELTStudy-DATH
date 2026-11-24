import { NotAvailable } from "@/components/NotAvailable";

export default function RecommenderEvaluationPage() {
  return <NotAvailable eyebrow="Admin" title="Recommender evaluation">The simulated comparison (BKT recommender vs sequential vs popularity) runs offline: `npm run eval` in backend/. Results and limits are in docs/EVALUATION.md.</NotAvailable>;
}
