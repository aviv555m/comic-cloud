import { Capacitor, CapacitorHttp } from '@capacitor/core';

// Detect environment
const isDev = import.meta.env.DEV;
const isNative = Capacitor.isNativePlatform();

// Helper to convert base64 to Uint8Array (browser/mobile compatible)
const atobArray = (data: string): Uint8Array => {
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Helper to convert Uint8Array to base64 (browser/mobile compatible)
const btoaArray = (data: Uint8Array): string => {
  let binary = '';
  const len = data.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
};

// Helper to load HTML into a DOM Document
const LoadDoc = (html: string): Document => {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
};

// Environment-aware proxy text fetcher
export async function proxyFetchText(targetUrl: string, headers?: Record<string, string>): Promise<string> {
  if (isDev) {
    let proxiedUrl = targetUrl;
    if (targetUrl.startsWith('https://mangafire.to')) {
      proxiedUrl = targetUrl.replace('https://mangafire.to', '/api-mangafire');
    } else if (targetUrl.startsWith('https://ww2.mangafreak.me')) {
      proxiedUrl = targetUrl.replace('https://ww2.mangafreak.me', '/api-mangafreak');
    } else if (targetUrl.startsWith('https://mangapark.io')) {
      proxiedUrl = targetUrl.replace('https://mangapark.io', '/api-mangapark');
    } else if (targetUrl.startsWith('https://manganato.com')) {
      proxiedUrl = targetUrl.replace('https://manganato.com', '/api-manganato');
    } else if (targetUrl.startsWith('https://chapmanganato.to')) {
      proxiedUrl = targetUrl.replace('https://chapmanganato.to', '/api-chapmanganato');
    }
    const res = await fetch(proxiedUrl, { headers });
    return res.text();
  } else if (isNative) {
    const response = await CapacitorHttp.get({
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...headers,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Proxy request failed with status ${response.status}`);
    }
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  } else {
    // Web Production CORS Proxy
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl, { headers });
    return res.text();
  }
}

// Environment-aware proxy JSON fetcher
export async function proxyFetchJson(
  targetUrl: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any,
  headers?: Record<string, string>
): Promise<any> {
  if (isDev) {
    let proxiedUrl = targetUrl;
    if (targetUrl.startsWith('https://mangafire.to')) {
      proxiedUrl = targetUrl.replace('https://mangafire.to', '/api-mangafire');
    } else if (targetUrl.startsWith('https://ww2.mangafreak.me')) {
      proxiedUrl = targetUrl.replace('https://ww2.mangafreak.me', '/api-mangafreak');
    } else if (targetUrl.startsWith('https://mangapark.io')) {
      proxiedUrl = targetUrl.replace('https://mangapark.io', '/api-mangapark');
    } else if (targetUrl.startsWith('https://manganato.com')) {
      proxiedUrl = targetUrl.replace('https://manganato.com', '/api-manganato');
    } else if (targetUrl.startsWith('https://chapmanganato.to')) {
      proxiedUrl = targetUrl.replace('https://chapmanganato.to', '/api-chapmanganato');
    }
    const res = await fetch(proxiedUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  } else if (isNative) {
    const options = {
      url: targetUrl,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...headers,
      },
      data: body,
    };
    const response = method === 'POST' ? await CapacitorHttp.post(options) : await CapacitorHttp.get(options);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Proxy request failed with status ${response.status}`);
    }
    return response.data;
  } else {
    // Web Production CORS Proxy
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }
}

// ============================================================================
// 1. MANGAFIRE CLIENT (WITH VRF GENERATOR)
// ============================================================================
class MangaFireVRF {
  private rc4Keys: Record<string, string> = {
    l: "FgxyJUQDPUGSzwbAq/ToWn4/e8jYzvabE+dLMb1XU1o=",
    g: "CQx3CLwswJAnM1VxOqX+y+f3eUns03ulxv8Z+0gUyik=",
    B: "fAS+otFLkKsKAJzu3yU+rGOlbbFVq+u+LaS6+s1eCJs=",
    m: "Oy45fQVK9kq9019+VysXVlz1F9S1YwYKgXyzGlZrijo=",
    F: "aoDIdXezm2l3HrcnQdkPJTDT8+W6mcl2/02ewBHfPzg=",
  };

  private seeds32: Record<string, string> = {
    A: "yH6MXnMEcDVWO/9a6P9W92BAh1eRLVFxFlWTHUqQ474=",
    V: "RK7y4dZ0azs9Uqz+bbFB46Bx2K9EHg74ndxknY9uknA=",
    N: "rqr9HeTQOg8TlFiIGZpJaxcvAaKHwMwrkqojJCpcvoc=",
    P: "/4GPpmZXYpn5RpkP7FC/dt8SXz7W30nUZTe8wb+3xmU=",
    k: "wsSGSBXKWA9q1oDJpjtJddVxH+evCfL5SO9HZnUDFU8=",
  };

  private prefixKeys: Record<string, string> = {
    O: "l9PavRg=",
    v: "Ml2v7ag1Jg==",
    L: "i/Va0UxrbMo=",
    p: "WFjKAHGEkQM=",
    W: "5Rr27rWd",
  };

  private add8(n: number) { return (c: number) => (c + n) & 0xff; }
  private sub8(n: number) { return (c: number) => (c - n + 256) & 0xff; }
  private xor8(n: number) { return (c: number) => (c ^ n) & 0xff; }
  private rotl8(n: number) { return (c: number) => ((c << n) | (c >> (8 - n))) & 0xff; }
  private rotr8(n: number) { return (c: number) => ((c >> n) | (c << (8 - n))) & 0xff; }

  private scheduleC = [
    this.sub8(223), this.rotr8(4), this.rotr8(4), this.add8(234), this.rotr8(7),
    this.rotr8(2), this.rotr8(7), this.sub8(223), this.rotr8(7), this.rotr8(6),
  ];

  private scheduleY = [
    this.add8(19), this.rotr8(7), this.add8(19), this.rotr8(6), this.add8(19),
    this.rotr8(1), this.add8(19), this.rotr8(6), this.rotr8(7), this.rotr8(4),
  ];

  private scheduleB = [
    this.sub8(223), this.rotr8(1), this.add8(19), this.sub8(223), this.rotl8(2),
    this.sub8(223), this.add8(19), this.rotl8(1), this.rotl8(2), this.rotl8(1),
  ];

  private scheduleJ = [
    this.add8(19), this.rotl8(1), this.rotl8(1), this.rotr8(1), this.add8(234),
    this.rotl8(1), this.sub8(223), this.rotl8(6), this.rotl8(4), this.rotl8(1),
  ];

  private scheduleE = [
    this.rotr8(1), this.rotl8(1), this.rotl8(6), this.rotr8(1), this.rotl8(2),
    this.rotr8(4), this.rotl8(1), this.rotl8(1), this.sub8(223), this.rotl8(2),
  ];

  private rc4(key: Uint8Array, input: Uint8Array): Uint8Array {
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

  private transform(
    input: Uint8Array,
    initSeedBytes: Uint8Array,
    prefixKeyBytes: Uint8Array,
    prefixLen: number,
    schedule: ((c: number) => number)[]
  ): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      if (i < prefixLen) {
        out.push(prefixKeyBytes[i] || 0);
      }
      const transformed = schedule[i % 10]((input[i] ^ initSeedBytes[i % 32]) & 0xff) & 0xff;
      out.push(transformed);
    }
    return new Uint8Array(out);
  }

  generate(input: string): string {
    const encodedInput = encodeURIComponent(input);
    let bytes = new TextEncoder().encode(encodedInput);

    bytes = this.rc4(atobArray(this.rc4Keys["l"]), bytes);
    const prefix_O = atobArray(this.prefixKeys["O"]);
    bytes = this.transform(bytes, atobArray(this.seeds32["A"]), prefix_O, prefix_O.length, this.scheduleC);

    bytes = this.rc4(atobArray(this.rc4Keys["g"]), bytes);
    const prefix_v = atobArray(this.prefixKeys["v"]);
    bytes = this.transform(bytes, atobArray(this.seeds32["V"]), prefix_v, prefix_v.length, this.scheduleY);

    bytes = this.rc4(atobArray(this.rc4Keys["B"]), bytes);
    const prefix_L = atobArray(this.prefixKeys["L"]);
    bytes = this.transform(bytes, atobArray(this.seeds32["N"]), prefix_L, prefix_L.length, this.scheduleB);

    bytes = this.rc4(atobArray(this.rc4Keys["m"]), bytes);
    const prefix_p = atobArray(this.prefixKeys["p"]);
    bytes = this.transform(bytes, atobArray(this.seeds32["P"]), prefix_p, prefix_p.length, this.scheduleJ);

    bytes = this.rc4(atobArray(this.rc4Keys["F"]), bytes);
    const prefix_W = atobArray(this.prefixKeys["W"]);
    bytes = this.transform(bytes, atobArray(this.seeds32["k"]), prefix_W, prefix_W.length, this.scheduleE);

    return btoaArray(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}

const fireVrf = new MangaFireVRF();

export const mangafireSearch = async (query: string) => {
  const vrf = fireVrf.generate(query.trim());
  const url = `https://mangafire.to/ajax/manga/search?keyword=${encodeURIComponent(query)}&vrf=${vrf}`;
  
  const data = await proxyFetchJson(url);
  if (!data?.result?.html) return [];

  const doc = LoadDoc(data.result.html);
  const units = doc.querySelectorAll("a.unit");
  const results = Array.from(units).map((e: any) => {
    const id = e.getAttribute("href")?.replace("/manga/", "") || "";
    const title = e.querySelector("h6")?.textContent?.trim() || "Untitled";
    const cover = e.querySelector("img")?.getAttribute("src") || undefined;
    return { title, url: id, cover };
  });

  return results;
};

export const mangafireChapters = async (mangaId: string) => {
  const url = `https://mangafire.to/manga/${mangaId}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  // Extract languages
  const langMap = new Map<string, string>();
  doc.querySelectorAll("[data-code][data-title]").forEach((e: any) => {
    let code = e.getAttribute("data-code")?.toLowerCase() || "";
    const title = e.getAttribute("data-title") || "";
    if (code === 'es' && title.includes('LATAM')) code = 'es-la';
    else if (code === 'pt' && title.includes('Br')) code = 'pt-br';
    langMap.set(code, code);
  });
  
  const codes = Array.from(langMap.values());
  const selectedLang = codes.includes("en") ? "en" : (codes[0] || "en");
  
  const mangaIdShort = mangaId.split(".").pop() || "";
  const vrf = fireVrf.generate(mangaIdShort + "@chapter@" + selectedLang);
  const chaptersUrl = `https://mangafire.to/ajax/read/${mangaIdShort}/chapter/${selectedLang}?vrf=${vrf}`;
  
  const chaptersData = await proxyFetchJson(chaptersUrl);
  const chaptersHtml = chaptersData?.result?.html || "";
  if (!chaptersHtml) return [];

  const chapDoc = LoadDoc(chaptersHtml);
  const list: any[] = [];
  chapDoc.querySelectorAll("a[data-number][data-id]").forEach((e: any) => {
    const chapter = e.getAttribute("data-number") || "";
    const id = e.getAttribute("data-id") || "";
    const title = e.getAttribute("title") || "";
    list.push({
      title: title ? `Ch. ${chapter} - ${title}` : `Chapter ${chapter}`,
      url: id,
      chapter: parseFloat(chapter) || 0
    });
  });

  // Sort chapters ascending or descending? The component displays top-down.
  // Standard mangadex order is desc. Let's make it descending.
  list.sort((a, b) => b.chapter - a.chapter);
  
  return list.map(c => ({ title: c.title, url: c.url }));
};

export const mangafirePages = async (chapterId: string) => {
  const vrf = fireVrf.generate("chapter@" + chapterId);
  const url = `https://mangafire.to/ajax/read/chapter/${chapterId}?vrf=${vrf}`;
  
  const data = await proxyFetchJson(url);
  const images = data?.result?.images || [];
  return images.map((img: any[]) => img[0]);
};


// ============================================================================
// 2. MANGAFREAK CLIENT
// ============================================================================
export const mangafreakSearch = async (query: string) => {
  const url = `https://ww2.mangafreak.me/Find/${encodeURIComponent(query)}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  const mangas: any[] = [];
  const items = doc.querySelectorAll("div.search_result div.manga_search_item");
  items.forEach((element: any) => {
    const titleElement = element.querySelector("h3 a");
    const imageElement = element.querySelector("img");
    if (titleElement) {
      const title = titleElement.textContent.trim();
      const href = titleElement.getAttribute("href") || "";
      const mangaId = href.split('/Manga/')[1];
      const src = imageElement ? imageElement.getAttribute("src") : "";
      
      let coverUrl = undefined;
      if (src) {
        const strippedUrl = src.replace(/^https?:\/\//, '');
        coverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(strippedUrl)}`;
      }

      mangas.push({
        title,
        url: mangaId,
        cover: coverUrl
      });
    }
  });

  return mangas;
};

export const mangafreakChapters = async (mangaId: string) => {
  const url = `https://ww2.mangafreak.me/Manga/${mangaId}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  const chapters: any[] = [];
  const extractChapterDetails = (linkElement: any) => {
    const fullUrl = linkElement.getAttribute('href') || "";
    const titleWithDate = linkElement.textContent.trim();
    const chapterId = fullUrl.split('/')[1] || "";
    const titleParts = titleWithDate.split(' - ');
    let chapterNumber = 0;
    if (titleParts.length > 0) {
      const chapMatch = titleParts[0].match(/(\d+(\.\d+)?)/);
      if (chapMatch) chapterNumber = parseFloat(chapMatch[0]);
    }
    return {
      title: titleWithDate,
      url: chapterId,
      chapter: chapterNumber
    };
  };

  // 1. Main chapter list
  doc.querySelectorAll('div.manga_series_list table tr').forEach((element: any, index: number) => {
    if (index === 0) return;
    const linkElement = element.querySelector('td:first-child a');
    if (linkElement) {
      chapters.push(extractChapterDetails(linkElement));
    }
  });

  // 2. Latest chapters list
  doc.querySelectorAll('div.series_sub_chapter_list div a').forEach((linkElement: any) => {
    chapters.push(extractChapterDetails(linkElement));
  });

  // Remove duplicates and sort descending
  const uniqueMap = new Map<string, any>();
  chapters.forEach(c => uniqueMap.set(c.url, c));
  const uniqueList = Array.from(uniqueMap.values());
  uniqueList.sort((a, b) => b.chapter - a.chapter);

  return uniqueList.map(c => ({ title: c.title, url: c.url }));
};

export const mangafreakPages = async (chapterId: string) => {
  const url = `https://ww2.mangafreak.me/${chapterId}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  const pages: string[] = [];
  doc.querySelectorAll('div.mySlides.fade img').forEach((element: any) => {
    const src = element.getAttribute('src');
    if (src) {
      pages.push(src);
    }
  });

  return pages;
};


// ============================================================================
// 3. MANGAPARK CLIENT
// ============================================================================
const MANGAPARK_API = 'https://mangapark.io/apo/';

const SEARCH_QUERY = `
  query($select: SearchComic_Select) {
    get_searchComic(select: $select) {
      items {
        data {
          id
          name
          altNames
          urlPath
          urlCoverOri
        }
      }
    }
  }
`;

const CHAPTERS_QUERY = `
  query($id: ID!) {
    get_comicChapterList(comicId: $id) {
      data {
        id
        dname
        title
        dateCreate
        dateModify
        urlPath
        srcTitle
        userNode {
          data {
            name
          }
        }
      }
    }
  }
`;

const PAGES_QUERY = `
  query($id: ID!) {
    get_chapterNode(id: $id) {
      data {
        imageFile {
          urlList
        }
      }
    }
  }
`;

export const mangaparkSearch = async (query: string) => {
  const data = await proxyFetchJson(MANGAPARK_API, 'POST', {
    query: SEARCH_QUERY,
    variables: {
      select: {
        page: 1,
        size: 24,
        word: query || null,
      }
    }
  });
  
  const items = data?.data?.get_searchComic?.items || [];
  return items.map((item: any) => {
    const d = item.data;
    return {
      title: d.name || "Unknown",
      url: d.id,
      cover: d.urlCoverOri || undefined
    };
  });
};

export const mangaparkChapters = async (mangaId: string) => {
  const data = await proxyFetchJson(MANGAPARK_API, 'POST', {
    query: CHAPTERS_QUERY,
    variables: { id: mangaId }
  });
  
  const chapterList = data?.data?.get_comicChapterList || [];
  const chapters = chapterList.map((chapterData: any) => {
    const d = chapterData.data;
    const title = `${d.dname}${d.title ? ` - ${d.title}` : ''}`;
    // Extract numeric chapter for sorting
    const numMatch = d.dname.match(/(?:Ch\.|Chapter)\s*(\d+(?:\.\d+)?)/i);
    const chapterNum = numMatch ? parseFloat(numMatch[1]) : 0;
    return {
      title,
      url: d.id,
      chapter: chapterNum
    };
  });

  chapters.sort((a: any, b: any) => b.chapter - a.chapter);
  return chapters.map((c: any) => ({ title: c.title, url: c.url }));
};

export const mangaparkPages = async (chapterId: string) => {
  const data = await proxyFetchJson(MANGAPARK_API, 'POST', {
    query: PAGES_QUERY,
    variables: { id: chapterId }
  });
  
  return data?.data?.get_chapterNode?.data?.imageFile?.urlList || [];
};

// ============================================================================
// 4. MANGANATO CLIENT
// ============================================================================
export const manganatoSearch = async (query: string) => {
  const formattedQuery = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const url = `https://manganato.com/search/story/${formattedQuery}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  const mangas: any[] = [];
  const items = doc.querySelectorAll("div.search-story-item");
  items.forEach((element: any) => {
    const titleElement = element.querySelector("a.item-title");
    const imageElement = element.querySelector("img");
    if (titleElement) {
      const title = titleElement.textContent.trim();
      const href = titleElement.getAttribute("href") || "";
      const mangaId = href.split('/').pop() || "";
      const cover = imageElement ? imageElement.getAttribute("src") : undefined;
      
      mangas.push({
        title,
        url: mangaId,
        cover
      });
    }
  });
  return mangas;
};

export const manganatoChapters = async (mangaId: string) => {
  const url = mangaId.includes('manga-') ? `https://chapmanganato.to/${mangaId}` : `https://manganato.com/${mangaId}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  const chapters: any[] = [];
  doc.querySelectorAll("li.a-h a.chapter-name").forEach((element: any) => {
    const title = element.textContent.trim();
    const href = element.getAttribute("href") || "";
    const parts = href.split('/');
    const chapterId = parts.slice(-2).join('/');
    
    const chapMatch = title.match(/(\d+(\.\d+)?)/);
    const chapterNumber = chapMatch ? parseFloat(chapMatch[0]) : 0;
    
    chapters.push({
      title,
      url: chapterId,
      chapter: chapterNumber
    });
  });
  
  chapters.sort((a, b) => b.chapter - a.chapter);
  return chapters.map(c => ({ title: c.title, url: c.url }));
};

export const manganatoPages = async (chapterId: string) => {
  const url = `https://chapmanganato.to/${chapterId}`;
  const html = await proxyFetchText(url);
  const doc = LoadDoc(html);
  
  const pages: string[] = [];
  doc.querySelectorAll("div.container-chapter-reader img").forEach((element: any) => {
    const src = element.getAttribute("src");
    if (src) {
      pages.push(src);
    }
  });
  return pages;
};
