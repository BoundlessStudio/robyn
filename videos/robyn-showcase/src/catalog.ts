import catalog from "../public/catalog.json";

export const studios = catalog.studios;
export const crafts = studios.flatMap((studio) => studio.apps);
export const readyCrafts = crafts.filter((app) => app.ready);
