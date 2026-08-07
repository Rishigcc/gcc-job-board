export const trackEvent = (eventName, parameters = {}) => {
  if (typeof window.gtag !== "undefined") {
    window.gtag("event", eventName, parameters);
  }
};