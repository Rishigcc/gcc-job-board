// Analytics must only report from the live site. Vercel builds every branch
// into a preview deployment using the same VITE_GA_ID, so without this guard
// every click made while testing a branch would land in GA4 as real traffic
// on www.iworkatgcc.com — and the numbers would be fiction for as long as a
// feature is in development.
const ANALYTICS_HOST = "www.iworkatgcc.com";

export const analyticsEnabled = () =>
  typeof window !== "undefined" &&
  window.location.hostname === ANALYTICS_HOST;

export const trackEvent = (eventName, parameters = {}) => {
  if (!analyticsEnabled()) return;

  if (typeof window.gtag !== "undefined") {
    window.gtag("event", eventName, parameters);
  }
};
