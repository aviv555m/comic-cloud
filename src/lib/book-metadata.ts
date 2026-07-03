export interface ExtractedBookMetadata {
  title: string;
  author: string | null;
  series: string | null;
}

export function normalizeSeriesName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export function getSeriesIdentityKey(value: string | null | undefined): string {
  return (normalizeSeriesName(value) || '').toLowerCase();
}

export function extractMetadataFromFilename(filename: string): ExtractedBookMetadata {
  let working = filename.replace(/\.[^/.]+$/, '').trim();
  let title = working;
  let author: string | null = null;
  let series: string | null = null;

  const authorMatch = working.match(/^\[([^\]]+)\]/);
  if (authorMatch) {
    author = authorMatch[1].trim();
    working = working.replace(authorMatch[0], '').trim();
    title = working;
  }

  const volumeMatch = working.match(/(.+?)(?:\s*-\s*)?(?:Volume|Vol\.?|Chapter|Ch\.?)\s*(\d+)/i);
  if (volumeMatch) {
    series = normalizeSeriesName(volumeMatch[1]);
    title = working;
  }

  return {
    title,
    author,
    series: series || normalizeSeriesName(working),
  };
}
