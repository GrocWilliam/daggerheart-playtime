// URLs of the app's pages.
export const homeUrl = (base) => `${base}/`;
export const runStepUrl = (base, campaignId) => `${base}/campaigns/${campaignId}?step=run`;
export const sheetUrl = (base, characterId, tab = 'play') => `${base}/characters/${characterId}?tab=${tab}`;
