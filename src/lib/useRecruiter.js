import { createContext, useContext } from "react";

// Populated by RecruiterRoute, which has already proven there is a session
// and a recruiter_profiles row before rendering its children.
export const RecruiterContext = createContext(null);

export function useRecruiter() {
  const value = useContext(RecruiterContext);

  if (!value) {
    throw new Error("useRecruiter must be used inside a RecruiterRoute");
  }

  return value;
}
