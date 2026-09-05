import { useEntityHearts } from "./useEntityHearts";

export function useQuestionHearts(userId, questionIds) {
  return useEntityHearts(
    "question_hearts",
    "question_id",
    userId,
    questionIds
  );
}
