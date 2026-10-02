// A refresh starts at the belt. A newly opened URL remains an explicit deep link.
// Preserve query parameters and fragments used by wallet and payment return flows.
export const resetReloadNavigation = (browser) => {
  if (browser.performance.getEntriesByType('navigation')[0]?.type !== 'reload') return;
  browser.history.replaceState(null, '', `/${browser.location.search}${browser.location.hash}`);
};
