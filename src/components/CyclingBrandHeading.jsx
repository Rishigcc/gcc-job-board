import { useEffect, useState } from "react";

const CYCLING_PHRASES = [
  "She Works At GCC",
  "He Works At GCC",
  "They Work At GCC",
  "Who Works At GCC?",
];

function CyclingBrandHeading({
  headingTag = "h1",
  headingClassName,
  phraseClassName = "text-sm font-medium tracking-wide text-slate-500 sm:text-base",
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phraseVisible, setPhraseVisible] = useState(true);

  useEffect(() => {
    let fadeInTimeout;

    const interval = setInterval(() => {
      setPhraseVisible(false);

      fadeInTimeout = setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % CYCLING_PHRASES.length);
        setPhraseVisible(true);
      }, 300);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(fadeInTimeout);
    };
  }, []);

  const HeadingTag = headingTag;

  return (
    <>
      <p
        aria-live="polite"
        className={`transition-opacity duration-300 ${phraseClassName} ${
          phraseVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {CYCLING_PHRASES[phraseIndex]}
      </p>

      <HeadingTag className={headingClassName}>iWorkAtGCC</HeadingTag>
    </>
  );
}

export default CyclingBrandHeading;
