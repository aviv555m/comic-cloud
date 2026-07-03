import fs from "fs";
import path from "path";
import JSZip from "jszip";

class MangaFireVRF {
  constructor() {
    this.rc4Keys = {
      l: "FgxyJUQDPUGSzwbAq/ToWn4/e8jYzvabE+dLMb1XU1o=",
      g: "CQx3CLwswJAnM1VxOqX+y+f3eUns03ulxv8Z+0gUyik=",
      B: "fAS+otFLkKsKAJzu3yU+rGOlbbFVq+u+LaS6+s1eCJs=",
      m: "Oy45fQVK9kq9019+VysXVlz1F9S1YwYKgXyzGlZrijo=",
      F: "aoDIdXezm2l3HrcnQdkPJTDT8+W6mcl2/02ewBHfPzg=",
    };
    this.seeds32 = {
      A: "yH6MXnMEcDVWO/9a6P9W92BAh1eRLVFxFlWTHUqQ474=",
      V: "RK7y4dZ0azs9Uqz+bbFB46Bx2K9EHg74ndxknY9uknA=",
      N: "rqr9HeTQOg8TlFiIGZpJaxcvAaKHwMwrkqojJCpcvoc=",
      P: "/4GPpmZXYpn5RpkP7FC/dt8SXz7W30nUZTe8wb+3xmU=",
      k: "wsSGSBXKWA9q1oDJpjtJddVxH+evCfL5SO9HZnUDFU8=",
    };
    this.prefixKeys = {
      O: "l9PavRg=",
      v: "Ml2v7ag1Jg==",
      L: "i/Va0UxrbMo=",
      p: "WFjKAHGEkQM=",
      W: "5Rr27rWd",
    };
    this.scheduleC = [this.sub8(223), this.rotr8(4), this.rotr8(4), this.add8(234), this.rotr8(7), this.rotr8(2), this.rotr8(7), this.sub8(223), this.rotr8(7), this.rotr8(6)];
    this.scheduleY = [this.add8(19), this.rotr8(7), this.add8(19), this.rotr8(6), this.add8(19), this.rotr8(1), this.add8(19), this.rotr8(6), this.rotr8(7), this.rotr8(4)];
    this.scheduleB = [this.sub8(223), this.rotr8(1), this.add8(19), this.sub8(223), this.rotl8(2), this.sub8(223), this.add8(19), this.rotl8(1), this.rotl8(2), this.rotl8(1)];
    this.scheduleJ = [this.add8(19), this.rotl8(1), this.rotl8(1), this.rotr8(1), this.add8(234), this.rotl8(1), this.sub8(223), this.rotl8(6), this.rotl8(4), this.rotl8(1)];
    this.scheduleE = [this.rotr8(1), this.rotl8(1), this.rotl8(6), this.rotr8(1), this.rotl8(2), this.rotr8(4), this.rotl8(1), this.rotl8(1), this.sub8(223), this.rotl8(2)];
  }

  add8(n) { return (c) => (c + n) & 0xff; }
  sub8(n) { return (c) => (c - n + 256) & 0xff; }
  rotl8(n) { return (c) => ((c << n) | (c >> (8 - n))) & 0xff; }
  rotr8(n) { return (c) => ((c >> n) | (c << (8 - n))) & 0xff; }
  atobArray(data) {
    const b = Buffer.from(data, "base64");
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  btoaArray(data) { return Buffer.from(data).toString("base64"); }

  rc4(key, input) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
    }
    const output = new Uint8Array(input.length);
    let i = 0;
    j = 0;
    for (let y = 0; y < input.length; y++) {
      i = (i + 1) & 0xff;
      j = (j + s[i]) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
      const k = s[(s[i] + s[j]) & 0xff];
      output[y] = input[y] ^ k;
    }
    return output;
  }

  transform(input, seed, prefix, prefixLen, schedule) {
    const out = [];
    for (let i = 0; i < input.length; i++) {
      if (i < prefixLen) out.push(prefix[i] || 0);
      out.push(schedule[i % 10]((input[i] ^ seed[i % 32]) & 0xff) & 0xff);
    }
    return new Uint8Array(out);
  }

  generate(input) {
    let bytes = new TextEncoder().encode(encodeURIComponent(input));
    bytes = this.rc4(this.atobArray(this.rc4Keys.l), bytes);
    let p = this.atobArray(this.prefixKeys.O);
    bytes = this.transform(bytes, this.atobArray(this.seeds32.A), p, p.length, this.scheduleC);
    bytes = this.rc4(this.atobArray(this.rc4Keys.g), bytes);
    p = this.atobArray(this.prefixKeys.v);
    bytes = this.transform(bytes, this.atobArray(this.seeds32.V), p, p.length, this.scheduleY);
    bytes = this.rc4(this.atobArray(this.rc4Keys.B), bytes);
    p = this.atobArray(this.prefixKeys.L);
    bytes = this.transform(bytes, this.atobArray(this.seeds32.N), p, p.length, this.scheduleB);
    bytes = this.rc4(this.atobArray(this.rc4Keys.m), bytes);
    p = this.atobArray(this.prefixKeys.p);
    bytes = this.transform(bytes, this.atobArray(this.seeds32.P), p, p.length, this.scheduleJ);
    bytes = this.rc4(this.atobArray(this.rc4Keys.F), bytes);
    p = this.atobArray(this.prefixKeys.W);
    bytes = this.transform(bytes, this.atobArray(this.seeds32.k), p, p.length, this.scheduleE);
    return this.btoaArray(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}

const fireVrf = new MangaFireVRF();
const DB_PATH = path.resolve("data/comic-cloud-db.json");
const USER_AGENT = "Mozilla/5.0";

function normalizeChapterIdentity(value) {
  return String(value || "")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\[offline\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function extractChapterNumber(value) {
  const match = String(value || "").match(/(?:ch|chap|chapter)\.?\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match?.[1] || null;
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n");
}

function parseUploadPath(fileUrl) {
  const match = String(fileUrl || "").match(/\/uploads\/(book-files\/[^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchText(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, ...extraHeaders } });
  if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, ...extraHeaders } });
  if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`);
  return res.json();
}

async function getMangafireChapters(seriesUrl) {
  const seriesPage = await fetchText(`https://mangafire.to/manga/${seriesUrl}`);
  const codes = [...seriesPage.matchAll(/data-code=\"([^\"]+)\"[^>]*data-title=\"([^\"]+)\"/g)].map((m) => m[1].toLowerCase());
  const lang = codes.includes("en") ? "en" : (codes[0] || "en");
  const shortId = seriesUrl.split(".").pop() || "";
  const vrf = fireVrf.generate(`${shortId}@chapter@${lang}`);
  const json = await fetchJson(`https://mangafire.to/ajax/read/${shortId}/chapter/${lang}?vrf=${vrf}`, {
    Referer: `https://mangafire.to/manga/${seriesUrl}`,
    "X-Requested-With": "XMLHttpRequest",
  });
  return [...String(json?.result?.html || "").matchAll(/data-number=\"([^\"]+)\"[^>]*data-id=\"([^\"]+)\"[^>]*title=\"([^\"]*)\"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
    title: (m[3] ? `Ch. ${m[1]} - ${m[3]}` : `${m[4]}` || `Chapter ${m[1]}`).trim(),
    url: m[2],
  }));
}

async function getMangafirePages(chapterId, seriesUrl) {
  const vrf = fireVrf.generate(`chapter@${chapterId}`);
  const json = await fetchJson(`https://mangafire.to/ajax/read/chapter/${chapterId}?vrf=${vrf}`, {
    Referer: `https://mangafire.to/manga/${seriesUrl}`,
    "X-Requested-With": "XMLHttpRequest",
  });
  return (json?.result?.images || []).map((item) => item[0]);
}

async function buildCbzFromPages(pageUrls) {
  const zip = new JSZip();
  for (let i = 0; i < pageUrls.length; i++) {
    const pageUrl = pageUrls[i];
    const res = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT, Referer: "https://mangafire.to/" } });
    if (!res.ok) throw new Error(`Page fetch failed ${res.status}: ${pageUrl}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (pageUrl.split("?")[0].split(".").pop() || "jpg").toLowerCase();
    const validExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
    zip.file(`${String(i + 1).padStart(3, "0")}.${validExt}`, buf);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

async function recoverBook(book, seriesCard) {
  if (String(seriesCard.author || "").toLowerCase() !== "mangafire") {
    throw new Error(`Unsupported source ${seriesCard.author}`);
  }
  const chapters = await getMangafireChapters(seriesCard.file_url);
  const wantedKey = normalizeChapterIdentity(book.title);
  const wantedChapterNumber = extractChapterNumber(book.title);
  const chapter =
    chapters.find((item) => normalizeChapterIdentity(item.title) === wantedKey) ||
    chapters.find((item) => {
      const candidateNumber = extractChapterNumber(item.title);
      return wantedChapterNumber && candidateNumber === wantedChapterNumber;
    });
  if (!chapter) throw new Error(`Chapter not found for ${book.title}`);
  const pages = await getMangafirePages(chapter.url, seriesCard.file_url);
  if (!pages.length) throw new Error(`No pages found for ${book.title}`);

  const cbzBuffer = await buildCbzFromPages(pages);
  const uploadPath = parseUploadPath(book.file_url);
  if (!uploadPath) throw new Error(`Could not parse upload path for ${book.id}`);

  for (const base of ["public/uploads", "dist/uploads"]) {
    const dest = path.resolve(base, uploadPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, cbzBuffer);
  }

  book.file_size = cbzBuffer.length;
  book.source_chapter_url = chapter.url;
  book.source_series_url = seriesCard.file_url;
  book.updated_at = new Date().toISOString();

  return { size: cbzBuffer.length, pages: pages.length, chapterUrl: chapter.url, uploadPath };
}

async function main() {
  const args = new Map(process.argv.slice(2).map((arg) => {
    const [k, v] = arg.split("=");
    return [k, v ?? "true"];
  }));
  const limit = Number(args.get("--limit") || "0");

  const db = readDb();
  const books = db.tables.books || [];
  const seriesCards = books.filter((book) => book.file_type === "manga");
  const missingCbzBooks = books.filter((book) => {
    if (book.file_type !== "cbz") return false;
    const uploadPath = parseUploadPath(book.file_url);
    if (!uploadPath) return false;
    return !fs.existsSync(path.resolve("public/uploads", uploadPath));
  });

  const selected = limit > 0 ? missingCbzBooks.slice(0, limit) : missingCbzBooks;
  console.log(`Recovering ${selected.length} missing manga chapter files...`);

  let repaired = 0;
  for (const book of selected) {
    const seriesCard = seriesCards.find((card) => normalizeChapterIdentity(card.title || card.series) === normalizeChapterIdentity(book.series));
    if (!seriesCard) {
      console.warn(`Skipping ${book.id}: no series card found for ${book.series}`);
      continue;
    }

    try {
      console.log(`Rebuilding ${book.title}...`);
      const result = await recoverBook(book, seriesCard);
      repaired++;
      console.log(`Restored ${book.id} -> ${result.uploadPath} (${result.pages} pages, ${result.size} bytes)`);
      writeDb(db);
    } catch (err) {
      console.warn(`Failed to rebuild ${book.id}:`, err.message || err);
    }
  }

  console.log(`Recovered ${repaired}/${selected.length} requested chapter files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
