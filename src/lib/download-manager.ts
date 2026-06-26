import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { openLocalDB } from '@/lib/local-supabase';
import JSZip from 'jszip';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useState, useEffect } from 'react';
import {
  mangafirePages,
  mangafreakPages,
  mangaparkPages,
  manganatoPages,
} from "@/lib/manga-sources-client";

export interface DownloadJob {
  id: string;
  title: string;
  series: string;
  source: string;
  progress: number;
  statusText: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  mode: 'save' | 'download';
  notificationId: number;
}

type Listener = (jobs: DownloadJob[]) => void;

const fetchImageAsArrayBuffer = async (imgUrl: string): Promise<ArrayBuffer> => {
  const isNative = Capacitor.isNativePlatform();
  let hostname = "";
  try {
    hostname = new URL(imgUrl).hostname.toLowerCase();
  } catch {}
  
  const ALLOWED_HOSTS = [
    "gutendex.com",
    "archive.org",
    "openlibrary.org",
    "www.wattpad.com",
    "api.mangadex.org",
    "uploads.mangadex.org",
    "standardebooks.org",
    "www.standardebooks.org",
    "covers.openlibrary.org",
    "comix.to",
    "www.comix.to"
  ];
  const isAllowedHost = ALLOWED_HOSTS.includes(hostname) || hostname.endsWith(".comix.to") || hostname.endsWith(".mangadex.org");
  
  if (isAllowedHost) {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: { url: imgUrl, responseType: "text" },
    });
    if (!error && data?.success && data.data) {
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }
  
  if (isNative) {
    const response = await CapacitorHttp.get({
      url: imgUrl,
      responseType: 'arraybuffer',
    });
    if (response.status >= 200 && response.status < 300 && response.data) {
      if (typeof response.data === 'string') {
        const binaryString = atob(response.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
      return response.data;
    }
  } else {
    try {
      const proxyUrl = `/api-image-proxy?url=${encodeURIComponent(imgUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) return await res.arrayBuffer();
    } catch (e) {
      console.warn("Failed to fetch image via local proxy:", e);
    }
  }
  
  const resDirect = await fetch(imgUrl);
  return await resDirect.arrayBuffer();
};

class DownloadManager {
  private jobs: DownloadJob[] = [];
  private listeners: Set<Listener> = new Set();
  private activeCount = 0;
  private maxConcurrent = 2;
  private lastNotificationTimes: Record<string, number> = {};

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener([...this.jobs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const jobsCopy = [...this.jobs];
    this.listeners.forEach(l => l(jobsCopy));
  }

  getJobs() {
    return [...this.jobs];
  }

  async requestPermission() {
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } else if ('Notification' in window) {
        if (Notification.permission !== 'granted') {
          await Notification.requestPermission();
        }
      }
    } catch (e) {
      console.warn("Failed to request notification permission:", e);
    }
  }

  private async sendNotification(job: DownloadJob, force: boolean = false) {
    const now = Date.now();
    const lastTime = this.lastNotificationTimes[job.id] || 0;
    
    // Throttle notifications to once per 3.5 seconds unless forced (start, complete, failed)
    if (!force && now - lastTime < 3500) {
      return;
    }
    
    this.lastNotificationTimes[job.id] = now;
    const title = `${job.mode === 'download' ? 'Downloading' : 'Saving'} Chapter`;
    const body = `${job.series} - ${job.title}: ${job.statusText} (${job.progress}%)`;
    
    try {
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: job.notificationId,
              schedule: { at: new Date(Date.now() + 50) },
              extra: null
            }
          ]
        });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, silent: true });
      }
    } catch (e) {
      console.warn("Failed to send system notification:", e);
    }
  }

  addJob(chapter: { title: string; url: string }, seriesTitle: string, source: string, mode: 'save' | 'download', coverUrl: string | null) {
    this.requestPermission();

    // Check if already in queue
    if (this.jobs.some(j => j.id === chapter.url && (j.status === 'pending' || j.status === 'downloading'))) {
      return;
    }

    // Filter out previous instances of this chapter URL
    this.jobs = this.jobs.filter(j => j.id !== chapter.url);

    const notificationId = Math.floor(Math.random() * 1000000) + 1;
    const job: DownloadJob = {
      id: chapter.url,
      title: chapter.title,
      series: seriesTitle,
      source: source,
      progress: 0,
      statusText: 'Queued...',
      status: 'pending',
      mode: mode,
      notificationId,
    };

    this.jobs.push(job);
    this.notify();
    this.sendNotification(job, true);
    this.processQueue(coverUrl);
  }

  private async processQueue(coverUrl: string | null) {
    if (this.activeCount >= this.maxConcurrent) return;

    const nextJob = this.jobs.find(j => j.status === 'pending');
    if (!nextJob) return;

    this.activeCount++;
    nextJob.status = 'downloading';
    nextJob.statusText = 'Starting...';
    this.notify();
    this.sendNotification(nextJob, true);

    try {
      await this.runJob(nextJob, coverUrl);
      nextJob.status = 'completed';
      nextJob.progress = 100;
      nextJob.statusText = 'Complete!';
      this.sendNotification(nextJob, true);
    } catch (err: any) {
      console.error("Background download job failed:", err);
      nextJob.status = 'failed';
      nextJob.statusText = err.message || 'Failed';
      this.sendNotification(nextJob, true);
    } finally {
      this.activeCount--;
      this.notify();
      
      // Auto-remove completed/failed jobs after 10 seconds from visible queue
      setTimeout(() => {
        this.jobs = this.jobs.filter(j => j.id !== nextJob.id);
        delete this.lastNotificationTimes[nextJob.id];
        this.notify();
      }, 10000);

      // Process next in queue
      this.processQueue(coverUrl);
    }
  }

  private async runJob(job: DownloadJob, coverUrl: string | null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    // 1. Fetch Page URLs
    job.statusText = 'Fetching pages...';
    this.notify();
    this.sendNotification(job);

    let imgs: string[] = [];
    const srcLower = job.source.toLowerCase();
    
    if (srcLower === "mangafire") {
      imgs = await mangafirePages(job.id);
    } else if (srcLower === "mangafreak") {
      imgs = await mangafreakPages(job.id);
    } else if (srcLower === "mangapark") {
      imgs = await mangaparkPages(job.id);
    } else if (srcLower === "manganato") {
      imgs = await manganatoPages(job.id);
    }

    if (imgs.length === 0) throw new Error("No pages found.");

    // 2. Download pages and package into CBZ
    const zip = new JSZip();
    for (let i = 0; i < imgs.length; i++) {
      const pageUrl = imgs[i];
      const percent = Math.round((i / imgs.length) * 75); // 0-75% progress
      
      job.progress = percent;
      job.statusText = `Downloading page ${i + 1}/${imgs.length}...`;
      this.notify();
      this.sendNotification(job);

      try {
        const buffer = await fetchImageAsArrayBuffer(pageUrl);
        const ext = pageUrl.split('?')[0].split('.').pop() || 'jpg';
        const validExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase()) ? ext : 'jpg';
        const fileName = `${String(i + 1).padStart(3, '0')}.${validExt}`;
        zip.file(fileName, buffer);
      } catch (fetchErr) {
        console.error(`Failed to fetch page ${i + 1}:`, fetchErr);
      }
    }

    job.progress = 78;
    job.statusText = 'Packaging CBZ...';
    this.notify();
    this.sendNotification(job);

    const cbzBlob = await zip.generateAsync({ type: 'blob' });
    if (cbzBlob.size < 1000) {
      throw new Error("Failed to package manga pages into CBZ.");
    }

    // 3. Upload CBZ to Supabase Storage
    job.progress = 80;
    job.statusText = 'Uploading...';
    this.notify();
    this.sendNotification(job);

    const fileName = `${user.id}/manga_${Date.now()}.cbz`;
    const { error: uploadError } = await supabase.storage
      .from("book-files")
      .upload(fileName, cbzBlob, {
        contentType: "application/x-cbz",
        cacheControl: "3600",
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 4. Create signed URL
    job.progress = 88;
    job.statusText = 'Creating link...';
    this.notify();
    this.sendNotification(job);

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("book-files")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year

    if (signedUrlError) throw signedUrlError;
    const fileUrl = signedUrlData.signedUrl;

    // Save series card if not exists
    const { data: existingSeries } = await supabase
      .from("books")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", job.series)
      .eq("file_type", "manga")
      .maybeSingle();

    if (!existingSeries) {
      await supabase.from("books").insert({
        user_id: user.id,
        title: job.series,
        author: job.source.toUpperCase(),
        cover_url: coverUrl ? `/api-image-proxy?url=${encodeURIComponent(coverUrl)}` : null,
        file_url: job.id,
        file_type: "manga",
        is_completed: false,
        reading_progress: 0,
        last_page_read: 0,
      });
    }

    // 5. Save CBZ record to Books
    job.progress = 92;
    job.statusText = 'Saving to Bookshelf...';
    this.notify();
    this.sendNotification(job);

    const { data: insertedBook, error: insertError } = await supabase
      .from("books")
      .insert({
        user_id: user.id,
        title: `${job.title}${job.mode === 'download' ? ' [Offline]' : ''}`,
        author: job.source.toUpperCase(),
        series: job.series,
        file_url: fileUrl,
        file_type: "cbz",
        file_size: cbzBlob.size,
        cover_url: coverUrl ? `/api-image-proxy?url=${encodeURIComponent(coverUrl)}` : null,
        last_page_read: 0,
        reading_progress: 0,
        is_completed: false
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 6. Caching offline if requested
    if (job.mode === 'download' && insertedBook) {
      job.progress = 95;
      job.statusText = 'Saving offline...';
      this.notify();
      this.sendNotification(job);

      const db = await openLocalDB();
      const transaction = db.transaction(['offline-books', 'offline-files'], 'readwrite');
      
      const offlineBook = {
        id: insertedBook.id,
        title: insertedBook.title,
        author: insertedBook.author,
        file_type: insertedBook.file_type,
        cover_url: insertedBook.cover_url,
        last_page_read: 0,
        cachedAt: Date.now(),
        fileSize: cbzBlob.size,
        series: insertedBook.series,
        file_url: fileUrl,
      };

      transaction.objectStore('offline-books').put(offlineBook);
      
      const arrayBuffer = await cbzBlob.arrayBuffer();
      
      // Optionally cache cover image offline
      let coverBlobData: ArrayBuffer | null = null;
      if (insertedBook.cover_url) {
        try {
          const fetchUrl = insertedBook.cover_url.startsWith('/') 
            ? `${window.location.origin}${insertedBook.cover_url}` 
            : insertedBook.cover_url;
          const coverRes = await fetch(fetchUrl);
          if (coverRes.ok) {
            const blob = await coverRes.blob();
            coverBlobData = await blob.arrayBuffer();
          }
        } catch (e) {
          console.warn("Failed to cache cover offline", e);
        }
      }

      transaction.objectStore('offline-files').put({
        bookId: insertedBook.id,
        data: arrayBuffer,
        contentType: 'application/x-cbz',
        coverData: coverBlobData
      });

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
  }
}

export const downloadQueue = new DownloadManager();

export const useDownloadJobs = () => {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  useEffect(() => {
    return downloadQueue.subscribe(setJobs);
  }, []);
  return jobs;
};
