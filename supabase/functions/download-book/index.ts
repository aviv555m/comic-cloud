import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import he from "https://esm.sh/he@1.2.0?target=deno";
import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Cache-Control": "no-cache",
};

interface DownloadResult {
  buffer: Uint8Array;
  contentType: string;
  extension: string;
  fileType: string;
  title: string;
  suggestedFileName?: string | null;
  originalFileName?: string | null;
  source?: "wattpad" | "mangadex";
  metadata?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, userId } = await req.json();

    if (!url || !userId) {
      throw new Error("URL and userId are required");
    }

    const normalizedUrl = String(url).trim();
    console.log("Downloading book from URL:", normalizedUrl);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const downloadResult = await resolveDownload(normalizedUrl);

    const timestamp = Date.now();
    const slugSource =
      downloadResult.suggestedFileName ||
      downloadResult.originalFileName ||
      extractNameFromUrl(normalizedUrl) ||
      downloadResult.title ||
      "book";
    const slug = slugify(slugSource);
    const safeSlug = slug.length > 0 ? slug : "book";
    const fileName = `${safeSlug}-${timestamp}.${downloadResult.extension}`;
    const filePath = `${userId}/${fileName}`;

    console.log("Uploading to storage:", filePath);
    const { error: uploadError } = await supabase.storage
      .from("book-files")
      .upload(filePath, downloadResult.buffer, {
        contentType: downloadResult.contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("book-files")
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: publicUrl,
        fileName,
        fileType: downloadResult.fileType,
        title: downloadResult.title,
        fileSize: downloadResult.buffer.byteLength,
        source: downloadResult.source ?? null,
        metadata: downloadResult.metadata ?? null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

async function resolveDownload(url: string): Promise<DownloadResult> {
  const host = safeGetHostname(url);

  if (host?.includes("wattpad.com")) {
    return await downloadFromWattpad(url);
  }

  if (
    host?.includes("mangadex.org") ||
    host === "api.mangadex.org" ||
    isUuid(url)
  ) {
    return await downloadFromMangaDex(url);
  }

  return await downloadDirectFile(url);
}

async function downloadDirectFile(url: string): Promise<DownloadResult> {
  const response = await fetch(url, { headers: BROWSER_HEADERS });

  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.statusText} (${response.status}). The server may be blocking automated downloads or the file may require authentication.`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const contentType = response.headers.get("content-type") ||
    "application/octet-stream";
  const contentDisposition = response.headers.get("content-disposition");
  const originalFileName = parseContentDispositionFileName(contentDisposition);

  const { extension, fileType } = determineFileAttributes(
    contentType,
    url,
    originalFileName,
  );

  const title =
    extractTitleFromFileName(originalFileName) ||
    extractNameFromUrl(url) ||
    `Downloaded File`;

  return {
    buffer,
    contentType,
    extension,
    fileType,
    title,
    originalFileName,
  };
}

async function downloadFromWattpad(url: string): Promise<DownloadResult> {
  const storyId = extractWattpadStoryId(url);
  if (!storyId) {
    throw new Error(
      "Could not determine Wattpad story ID. Please provide a valid Wattpad story URL.",
    );
  }

  const storyFields =
    "id,title,description,user(name,username),parts(id,title,position,order)";
  const storyResponse = await fetch(
    `https://www.wattpad.com/api/v3/stories/${storyId}?fields=${storyFields}`,
    { headers: BROWSER_HEADERS },
  );

  if (!storyResponse.ok) {
    throw new Error(
      `Failed to fetch Wattpad story metadata: ${storyResponse.statusText}`,
    );
  }

  const story = await storyResponse.json();

  const parts: Array<{
    id: number | string;
    title?: string;
    position?: number;
    order?: number;
  }> = Array.isArray(story?.parts) ? story.parts : [];

  if (parts.length === 0) {
    throw new Error(
      "No public chapters found for this Wattpad story. It may be unpublished or restricted.",
    );
  }

  const orderedParts = [...parts].sort((a, b) =>
    (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0)
  );

  const encoder = new TextEncoder();
  const partTexts: string[] = [];

  for (const part of orderedParts) {
    const partId = part.id;
    const partTitle = part.title?.trim() ?? "";
    const partResp = await fetch(
      `https://www.wattpad.com/apiv2/storytext?id=${partId}`,
      { headers: BROWSER_HEADERS },
    );

    if (!partResp.ok) {
      throw new Error(
        `Failed to fetch Wattpad chapter (ID ${partId}): ${partResp.statusText}`,
      );
    }

    const rawHtml = await partResp.text();
    const plainText = htmlToPlainText(rawHtml).trim();
    const heading = partTitle ? `${partTitle}\n\n` : "";
    partTexts.push(`${heading}${plainText}`);
  }

  const author =
    story?.user?.name?.trim() || story?.user?.username?.trim() || null;
  const headerLines = [
    story?.title?.trim() || `Wattpad Story ${storyId}`,
    author ? `by ${author}` : null,
    null,
  ].filter((line): line is string => Boolean(line));

  const combinedText = [...headerLines, ...partTexts].join("\n\n");

  return {
    buffer: encoder.encode(combinedText),
    contentType: "text/plain; charset=utf-8",
    extension: "txt",
    fileType: "txt",
    title: story?.title?.trim() || `Wattpad Story ${storyId}`,
    suggestedFileName: story?.title?.trim() || `wattpad-story-${storyId}`,
    metadata: {
      author,
      parts: orderedParts.length,
      sourceUrl: `https://www.wattpad.com/story/${storyId}`,
    },
    source: "wattpad",
  };
}

async function downloadFromMangaDex(urlOrChapterId: string): Promise<
  DownloadResult
> {
  const chapterId = extractMangaDexChapterId(urlOrChapterId);
  if (!chapterId) {
    throw new Error(
      "Could not determine MangaDex chapter ID. Please provide a MangaDex chapter URL.",
    );
  }

  const chapterUrl =
    `https://api.mangadex.org/chapter/${chapterId}?includes[]=manga&includes[]=scanlation_group`;
  const chapterResponse = await fetch(chapterUrl, { headers: BROWSER_HEADERS });

  if (!chapterResponse.ok) {
    throw new Error(
      `Failed to fetch MangaDex chapter metadata: ${chapterResponse.statusText}`,
    );
  }

  const chapterPayload = await chapterResponse.json();
  const chapterData = chapterPayload?.data;

  if (!chapterData) {
    throw new Error("MangaDex chapter metadata was empty.");
  }

  const chapterAttributes = chapterData.attributes || {};
  if (chapterAttributes.isExternal || chapterAttributes.externalUrl) {
    throw new Error(
      "This MangaDex chapter is hosted externally and cannot be downloaded directly.",
    );
  }

  const mangaRel = (chapterData.relationships || []).find((rel: any) =>
    rel?.type === "manga"
  );
  let mangaTitle: string | null = null;

  if (mangaRel?.id) {
    const mangaResponse = await fetch(
      `https://api.mangadex.org/manga/${mangaRel.id}`,
      { headers: BROWSER_HEADERS },
    );
    if (mangaResponse.ok) {
      const mangaPayload = await mangaResponse.json();
      const titles = mangaPayload?.data?.attributes?.title || {};
      mangaTitle = titles.en ||
        titles["ja-ro"] ||
        Object.values(titles)[0] ||
        null;
    }
  }

  const atHomeResponse = await fetch(
    `https://api.mangadex.org/at-home/server/${chapterId}`,
    { headers: BROWSER_HEADERS },
  );

  if (!atHomeResponse.ok) {
    throw new Error(
      `Failed to fetch MangaDex page list: ${atHomeResponse.statusText}`,
    );
  }

  const atHomeData = await atHomeResponse.json();
  const baseUrl: string | undefined = atHomeData?.baseUrl;
  const chapterInfo = atHomeData?.chapter;
  const hash: string | undefined = chapterInfo?.hash;
  const pageList: string[] = Array.isArray(chapterInfo?.dataSaver) &&
      chapterInfo.dataSaver.length > 0
    ? chapterInfo.dataSaver
    : Array.isArray(chapterInfo?.data)
    ? chapterInfo.data
    : [];
  const directory =
    Array.isArray(chapterInfo?.dataSaver) && chapterInfo.dataSaver.length > 0
      ? "data-saver"
      : "data";

  if (!baseUrl || !hash || pageList.length === 0) {
    throw new Error(
      "MangaDex returned an incomplete image list for this chapter.",
    );
  }

  const zip = new JSZip();
  let index = 1;

  for (const file of pageList) {
    const imageUrl = `${baseUrl}/${directory}/${hash}/${file}`;
    const imageResponse = await fetch(imageUrl, { headers: BROWSER_HEADERS });

    if (!imageResponse.ok) {
      throw new Error(
        `Failed to download MangaDex page ${index}: ${imageResponse.statusText}`,
      );
    }

    const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
    const extension = file.split(".").pop() || "jpg";
    const paddedIndex = String(index).padStart(3, "0");
    zip.addFile(`${paddedIndex}.${extension}`, imageBuffer);
    index += 1;
  }

  const zipBuffer = await zip.generateAsync<{ type: "uint8array" }>({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  }) as unknown as Uint8Array;

  const chapterNumber = chapterAttributes.chapter
    ? `Ch ${chapterAttributes.chapter}`
    : null;
  const resolvedTitle = [
    mangaTitle,
    chapterNumber,
    chapterAttributes.title?.trim() || null,
  ].filter((part): part is string => Boolean(part)).join(" - ") ||
    `MangaDex Chapter ${chapterId}`;

  return {
    buffer: zipBuffer,
    contentType: "application/vnd.comicbook+zip",
    extension: "cbz",
    fileType: "cbz",
    title: resolvedTitle,
    suggestedFileName: resolvedTitle,
    metadata: {
      chapterId,
      mangaId: mangaRel?.id ?? null,
      chapterNumber: chapterAttributes.chapter ?? null,
      volume: chapterAttributes.volume ?? null,
      language: chapterAttributes.translatedLanguage ?? null,
      pageCount: pageList.length,
    },
    source: "mangadex",
  };
}

function determineFileAttributes(
  contentType: string,
  url: string,
  originalFileName?: string | null,
): { extension: string; fileType: string } {
  const loweredUrl = url.toLowerCase();
  const loweredType = contentType.toLowerCase();
  const loweredName = originalFileName?.toLowerCase() ?? "";

  const checks = [
    {
      match: loweredType.includes("pdf") ||
        loweredUrl.endsWith(".pdf") ||
        loweredName.endsWith(".pdf"),
      extension: "pdf",
      fileType: "pdf",
    },
    {
      match: loweredType.includes("epub") ||
        loweredUrl.endsWith(".epub") ||
        loweredName.endsWith(".epub"),
      extension: "epub",
      fileType: "epub",
    },
    {
      match: loweredUrl.endsWith(".cbz") || loweredName.endsWith(".cbz"),
      extension: "cbz",
      fileType: "cbz",
    },
    {
      match: loweredUrl.endsWith(".cbr") || loweredName.endsWith(".cbr"),
      extension: "cbr",
      fileType: "cbr",
    },
    {
      match: loweredType.includes("zip") ||
        loweredType.includes("comic") ||
        loweredName.endsWith(".zip"),
      extension: "cbz",
      fileType: "cbz",
    },
    {
      match: loweredType.includes("plain") ||
        loweredType.includes("text") ||
        loweredUrl.endsWith(".txt") ||
        loweredName.endsWith(".txt"),
      extension: "txt",
      fileType: "txt",
    },
  ];

  for (const check of checks) {
    if (check.match) {
      return { extension: check.extension, fileType: check.fileType };
    }
  }

  return { extension: "bin", fileType: "binary" };
}

function parseContentDispositionFileName(
  header: string | null,
): string | null {
  if (!header) return null;

  // RFC5987 filename* support
  const filenameStarMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (filenameStarMatch) {
    const value = filenameStarMatch[1].trim();
    const parts = value.split("''");
    const encoded = parts.length === 2 ? parts[1] : parts[0];
    try {
      return decodeURIComponent(encoded.replace(/^"+|"+$/g, ""));
    } catch {
      return encoded.replace(/^"+|"+$/g, "");
    }
  }

  const filenameMatch = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (filenameMatch) {
    return filenameMatch[1].trim();
  }

  return null;
}

function extractTitleFromFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.replace(/[_-]+/g, " ").trim() || null;
}

function extractNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
    if (!lastSegment) return null;
    return decodeURIComponent(lastSegment.split(".")[0])
      .replace(/[_-]+/g, " ")
      .trim() || null;
  } catch {
    return null;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeGetHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function extractWattpadStoryId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const searchId = parsed.searchParams.get("id") ||
      parsed.searchParams.get("story_id");
    if (searchId && /^\d+$/.test(searchId)) {
      return searchId;
    }

    const path = parsed.pathname;
    const storyMatch = path.match(/\/story\/(\d+)/);
    if (storyMatch) return storyMatch[1];

    const genericMatch = path.match(/\/(\d+)(?:-|$)/);
    if (genericMatch) return genericMatch[1];

    return null;
  } catch {
    return null;
  }
}

function extractMangaDexChapterId(value: string): string | null {
  if (isUuid(value)) return value;
  try {
    const parsed = new URL(value);
    const pathMatch = parsed.pathname.match(
      /(?:chapter|at-home\/server)\/([0-9a-fA-F-]{36})/,
    );
    if (pathMatch) return pathMatch[1];

    const idParam = parsed.searchParams.get("chapterId") ||
      parsed.searchParams.get("id");
    if (idParam && isUuid(idParam)) return idParam;

    const uuidMatch = value.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (uuidMatch) return uuidMatch[0];

    return null;
  } catch {
    const uuidMatch = value.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    return uuidMatch ? uuidMatch[0] : null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value.trim(),
  );
}

function htmlToPlainText(html: string): string {
  return he.decode(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/?[^>]+(>|$)/g, ""),
  ).replace(/\u00a0/g, " ");
}