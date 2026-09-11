export const SITE_URL = "https://www.iworkatgcc.com";
export const SITE_NAME = "iWorkAtGCC";

// Placeholder path — swap for a real 1200x630 asset in /public.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export function truncateDescription(text, maxLength = 160) {
  if (!text) return "";

  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  };
}

export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };
}

export function buildBreadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

// Google requires a QAPage's Question to carry at least one answer, so
// unanswered questions fall back to plain WebPage markup instead.
export function buildQuestionJsonLd({ question, answers }) {
  const questionUrl = `${SITE_URL}/questions/${question.slug}`;
  const hasAnswers = answers.length > 0;

  if (!hasAnswers) {
    return {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": questionUrl,
      url: questionUrl,
      name: question.title,
      description: question.description,
    };
  }

  const toAnswerNode = (answer) => ({
    "@type": "Answer",
    text: answer.body,
    dateCreated: answer.created_at,
    url: questionUrl,
    upvoteCount: answer.heartCount || 0,
    author: {
      "@type": "Person",
      name: answer.author_name || "Community Member",
    },
  });

  const [accepted, ...rest] = answers;

  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    "@id": questionUrl,
    url: questionUrl,
    name: question.title,
    mainEntity: {
      "@type": "Question",
      name: question.title,
      text: question.description,
      answerCount: answers.length,
      dateCreated: question.created_at,
      upvoteCount: question.heartCount || 0,
      author: {
        "@type": "Person",
        name: question.author_name || "Community Member",
      },
      acceptedAnswer: toAnswerNode(accepted),
      ...(rest.length > 0
        ? { suggestedAnswer: rest.map(toAnswerNode) }
        : {}),
    },
  };
}
