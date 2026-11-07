import { readPage } from "@/studio/pagination";

export type Page = { query?: string; cursor?: string };

export function pageFor({ query, cursor }: Page) {
  const url = new URL("https://robyn.invalid");
  if (query) url.searchParams.set("q", query);
  if (cursor) url.searchParams.set("cursor", cursor);
  return readPage(url.href, 50);
}
