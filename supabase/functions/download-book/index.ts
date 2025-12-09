import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SECURITY FIX: Extract userId from authenticated session, not request body
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Authorization header is required");
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      throw new Error("Authentication failed");
    }
    
    const userId = user.id;
    console.log("Authenticated user:", userId);

    const { url } = await req.json();
    
    if (!url) {
      throw new Error("URL is required");
    }

    console.log("Downloading book from URL:", url);

    // Try multiple download attempts with different approaches
    let fileResponse: Response | null = null;
    let lastError: string = "";

    // Attempt 1: Direct fetch with browser headers
    try {
      fileResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/epub+zip, application/pdf, application/octet-stream, */*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive',
        },
        redirect: 'follow',
      });
      
      if (!fileResponse.ok) {
        lastError = `HTTP ${fileResponse.status}`;
        fileResponse = null;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Unknown error";
      console.log("Attempt 1 failed:", lastError);
    }

    // Attempt 2: Try alternative URL patterns for Internet Archive
    if (!fileResponse && url.includes("archive.org")) {
      console.log("Trying Internet Archive alternative patterns...");
      
      const identifier = url.match(/\/download\/([^/]+)/)?.[1];
      if (identifier) {
        // Try fetching the file list first
        const filesUrl = `https://archive.org/metadata/${identifier}/files`;
        try {
          const metadataResponse = await fetch(filesUrl);
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            const files = metadata.result || [];
            
            // Find the best file (epub > pdf > cbz)
            const epubFile = files.find((f: any) => f.name?.toLowerCase().endsWith('.epub'));
            const pdfFile = files.find((f: any) => f.name?.toLowerCase().endsWith('.pdf') && !f.name?.includes('_text'));
            const cbzFile = files.find((f: any) => f.name?.toLowerCase().endsWith('.cbz'));
            
            const bestFile = epubFile || pdfFile || cbzFile;
            
            if (bestFile) {
              const actualUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(bestFile.name)}`;
              console.log("Found actual file URL:", actualUrl);
              
              fileResponse = await fetch(actualUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Accept': '*/*',
                },
                redirect: 'follow',
              });
              
              if (!fileResponse.ok) {
                lastError = `Alternative URL failed: HTTP ${fileResponse.status}`;
                fileResponse = null;
              }
            }
          }
        } catch (e) {
          console.log("Metadata fetch failed:", e);
        }
      }
    }

    // Attempt 3: Try without the assumed filename for Internet Archive
    if (!fileResponse && url.includes("archive.org/download/")) {
      const parts = url.split("/download/");
      if (parts.length === 2) {
        const pathParts = parts[1].split("/");
        const identifier = pathParts[0];
        
        // Sometimes the direct link works with just the identifier and format
        const extension = url.split(".").pop()?.toLowerCase() || "epub";
        const altUrls = [
          `https://archive.org/download/${identifier}/${identifier}.${extension}`,
          `https://archive.org/download/${identifier}/${identifier}_text.${extension}`,
        ];
        
        for (const altUrl of altUrls) {
          if (altUrl === url) continue; // Skip if same as original
          
          try {
            console.log("Trying alternative URL:", altUrl);
            fileResponse = await fetch(altUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
              },
              redirect: 'follow',
            });
            
            if (fileResponse.ok) {
              console.log("Alternative URL worked!");
              break;
            }
            fileResponse = null;
          } catch (e) {
            console.log("Alt URL failed:", altUrl);
          }
        }
      }
    }

    if (!fileResponse || !fileResponse.ok) {
      throw new Error(`Failed to download file after multiple attempts. Last error: ${lastError}`);
    }

    const contentType = fileResponse.headers.get("content-type") || "";
    const contentDisposition = fileResponse.headers.get("content-disposition") || "";
    const arrayBuffer = await fileResponse.arrayBuffer();
    
    console.log("Downloaded bytes:", arrayBuffer.byteLength, "Content-Type:", contentType);

    // Check if we got HTML instead of a book file (common error)
    if (arrayBuffer.byteLength < 1000) {
      const textContent = new TextDecoder().decode(arrayBuffer);
      if (textContent.includes('<!DOCTYPE') || textContent.includes('<html') || textContent.includes('Error')) {
        console.error("Received HTML/error page:", textContent.substring(0, 200));
        throw new Error("Received error page instead of book file. The file may not be available.");
      }
    }

    // Check magic bytes for file type detection
    const header = new Uint8Array(arrayBuffer.slice(0, 8));
    
    let detectedType = "";
    if (header[0] === 0x50 && header[1] === 0x4B) {
      // ZIP-based format (EPUB, CBZ, DOCX, etc.)
      detectedType = "zip";
    } else if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
      // PDF
      detectedType = "pdf";
    } else if (header[0] === 0x52 && header[1] === 0x61 && header[2] === 0x72) {
      // RAR (CBR)
      detectedType = "rar";
    }

    const fileBlob = new Blob([arrayBuffer]);

    // Determine file type from URL, content-type, content-disposition, and magic bytes
    let fileType = "epub";
    let extension = "epub";
    const lowerUrl = url.toLowerCase();
    
    // Try to get filename from content-disposition
    let filename = "";
    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match) {
        filename = match[1].replace(/['"]/g, '').toLowerCase();
      }
    }
    
    // Determine type from multiple sources
    if (contentType.includes("pdf") || lowerUrl.endsWith(".pdf") || filename.endsWith(".pdf") || detectedType === "pdf") {
      fileType = "pdf";
      extension = "pdf";
    } else if (contentType.includes("epub") || lowerUrl.endsWith(".epub") || filename.endsWith(".epub")) {
      fileType = "epub";
      extension = "epub";
    } else if (lowerUrl.endsWith(".cbz") || filename.endsWith(".cbz")) {
      fileType = "cbz";
      extension = "cbz";
    } else if (lowerUrl.endsWith(".cbr") || filename.endsWith(".cbr") || detectedType === "rar") {
      fileType = "cbr";
      extension = "cbr";
    } else if (lowerUrl.endsWith(".txt") || filename.endsWith(".txt") || contentType.includes("text/plain")) {
      fileType = "txt";
      extension = "txt";
    } else if (detectedType === "zip") {
      // ZIP file - likely EPUB or CBZ
      if (lowerUrl.includes("comic") || lowerUrl.includes("manga")) {
        fileType = "cbz";
        extension = "cbz";
      } else {
        fileType = "epub";
        extension = "epub";
      }
    } else if (contentType.includes("zip") && lowerUrl.includes("epub")) {
      // Some servers return application/zip for epub
      fileType = "epub";
      extension = "epub";
    } else if (contentType.includes("octet-stream")) {
      // Generic binary - try to determine from URL
      if (lowerUrl.includes(".pdf")) {
        fileType = "pdf";
        extension = "pdf";
      } else if (lowerUrl.includes(".cbz")) {
        fileType = "cbz";
        extension = "cbz";
      }
    }

    // Generate filename
    const timestamp = Date.now();
    const fileName = `${timestamp}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase Storage
    console.log("Uploading to storage:", filePath, "type:", fileType, "size:", arrayBuffer.byteLength);
    const { error: uploadError } = await supabase.storage
      .from('book-files')
      .upload(filePath, fileBlob, {
        contentType: contentType || `application/${extension}`,
        upsert: false
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    // Get signed URL for the file (since bucket is now private)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('book-files')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry

    if (signedUrlError) {
      console.error("Signed URL error:", signedUrlError);
      throw signedUrlError;
    }

    // Extract title from URL
    const urlParts = url.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    const titleFromUrl = decodeURIComponent(lastPart.split('.')[0]).replace(/[_-]/g, ' ');

    console.log("Download successful:", { fileType, size: arrayBuffer.byteLength });

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: signedUrlData.signedUrl,
        fileName,
        fileType,
        title: titleFromUrl,
        fileSize: arrayBuffer.byteLength
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});