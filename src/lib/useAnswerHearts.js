import { useEntityHearts } from "./useEntityHearts";

export function useAnswerHearts(userId, answerIds) {
  return useEntityHearts("answer_hearts", "answer_id", userId, answerIds);
}
