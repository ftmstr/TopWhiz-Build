import data from "../data/published-content.json";
export interface PublishedStory {
  slug: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: string;
  author: string;
  sources: {label: string; url: string}[];
  mediaPath?: string;
  mediaAlt?: string;
}
export interface PublishedPhone {
  slug: string;
  title: string;
  summary: string;
  brand: string;
  modelCode: string;
  market: string;
  variants: {name: string; ramGb: number; storageGb: number; warrantyClass: string}[];
  specifications: {label:string;value:string;sourceLabel:string}[];
  mediaPath?: string;
  mediaAlt?: string;
}

export const approvedContent = data as {news:PublishedStory[]; phones:PublishedPhone[]};

export function safeMediaPath(value: string | undefined): string | null {
  if(!value || !/^\/media\/[a-z0-9/_-]+\.(?:webp|png|jpe?g)$/.test(value)) return null;
  if(value.includes("//") || value.includes("..")) return null;
  return value;
}
