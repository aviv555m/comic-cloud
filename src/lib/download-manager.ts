import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

interface UpdatePluginType {
  downloadAndInstall(options: { url: string }): Promise<{ success: boolean }>;
  startBackgroundService(): Promise<{ success: boolean }>;
  stopBackgroundService(): Promise<{ success: boolean }>;
}

const UpdatePlugin = registerPlugin<UpdatePluginType>("UpdatePlugin");
import { supabase } from '@/integrations/supabase/client';
import { openLocalDB, saveLocalFile } from '@/lib/local-supabase';
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
  coverUrl?: string | null;
  downloadedPages?: number;
  totalPages?: number;
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
  private maxConcurrent = 1;
  private lastNotificationTimes: Record<string, number> = {};

  private totalSessionJobs = 0;
  private completedSessionJobs = 0;
  private isSessionActive = false;
  private silentAudio: HTMLAudioElement | null = null;

  constructor() {
    this.loadPersistedQueue();
    
    // Listen to network status change events to pause and resume the download queue automatically
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log("[DownloadManager] Device came online. Resuming queue...");
        let changed = false;
        this.jobs.forEach(j => {
          if (j.statusText === 'Paused: Waiting for connection...') {
            j.statusText = 'Queued...';
            changed = true;
          }
        });
        if (changed) {
          this.notify();
        }
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        console.log("[DownloadManager] Device went offline. Pausing queue...");
        let changed = false;
        this.jobs.forEach(j => {
          if (j.status === 'pending' && j.statusText !== 'Paused: Waiting for connection...') {
            j.statusText = 'Paused: Waiting for connection...';
            changed = true;
          }
        });
        if (changed) {
          this.notify();
        }
      });
    }
    
    // Automatically listen to App State Changes (foreground/background) to resume/pause the queue!
    if (Capacitor.isNativePlatform()) {
      try {
        App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            console.log("[DownloadManager] App became active. Resuming queue...");
            // Reset any stuck 'downloading' jobs to 'pending' so they retry from the beginning!
            let changed = false;
            this.jobs.forEach(j => {
              if (j.status === 'downloading') {
                j.status = 'pending';
                j.statusText = 'Queued (resumed)...';
                changed = true;
              }
            });
            if (changed) {
              this.notify();
              this.persistQueue();
            }
            this.processQueue();
          }
        });
      } catch (err) {
        console.warn("Failed to listen to appStateChange:", err);
      }
    }
  }

  private startSilentAudio() {
    if (this.silentAudio) return;
    try {
      const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";
      this.silentAudio = new Audio(silentWav);
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.01;
      this.silentAudio.play().catch(e => {
        console.warn("Autoplay / audio start prevented:", e);
      });
    } catch (e) {
      console.warn("Failed to initialize background silent audio keep-alive:", e);
    }
  }

  private stopSilentAudio() {
    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
      } catch (e) {}
      this.silentAudio = null;
    }
  }

  private loadPersistedQueue() {
    try {
      const storedJobs = localStorage.getItem('download_queue_jobs');
      const storedSession = localStorage.getItem('download_queue_session');
      if (storedJobs) {
        const loadedJobs: DownloadJob[] = JSON.parse(storedJobs);
        // Reset stuck statuses
        this.jobs = loadedJobs.map(j => {
          if (j.status === 'downloading') {
            return { ...j, status: 'pending', statusText: 'Queued (restored)...', progress: 0 };
          }
          return j;
        });
      }
      if (storedSession) {
        const session = JSON.parse(storedSession);
        this.totalSessionJobs = session.total || 0;
        this.completedSessionJobs = session.completed || 0;
        this.isSessionActive = session.isSessionActive || false;
      }
      
      // If there are pending/restored jobs, start the background service and process queue loop!
      if (this.jobs.some(j => j.status === 'pending')) {
        if (Capacitor.isNativePlatform()) {
          UpdatePlugin.startBackgroundService().catch(e => console.warn("Failed to start background service:", e));
        }
        this.startSilentAudio();
        setTimeout(() => this.processQueue(), 1000);
      }
    } catch (e) {
      console.warn("Failed to load persisted download queue:", e);
    }
  }

  private persistQueue() {
    try {
      localStorage.setItem('download_queue_jobs', JSON.stringify(this.jobs));
      localStorage.setItem('download_queue_session', JSON.stringify({
        total: this.totalSessionJobs,
        completed: this.completedSessionJobs,
        isSessionActive: this.isSessionActive
      }));
    } catch (e) {
      console.warn("Failed to persist download queue:", e);
    }
  }

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
    this.persistQueue();
  }

  getJobs() {
    return [...this.jobs];
  }

  getSessionStats() {
    return {
      total: this.totalSessionJobs,
      completed: this.completedSessionJobs,
      active: this.isSessionActive
    };
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

  private getTextProgressBar(progress: number): string {
    const totalBlocks = 10;
    const filledBlocks = Math.min(totalBlocks, Math.max(0, Math.round(progress / 10)));
    const emptyBlocks = totalBlocks - filledBlocks;
    return "[" + "█".repeat(filledBlocks) + "░".repeat(emptyBlocks) + "]";
  }

  private async updateQueueNotification(force: boolean = false) {
    if (!this.isSessionActive || this.totalSessionJobs === 0) return;

    const now = Date.now();
    const lastTime = this.lastNotificationTimes['session'] || 0;
    
    // Throttle notifications to once per 3.5 seconds unless forced (start, complete, failed)
    if (!force && now - lastTime < 3500) {
      return;
    }
    
    this.lastNotificationTimes['session'] = now;

    // Calculate overall progress based on finished jobs + currently downloading job progress
    const downloadingJob = this.jobs.find(j => j.status === 'downloading');
    const currentJobProgress = downloadingJob ? downloadingJob.progress : 0;
    
    const overallProgress = Math.min(100, Math.max(0, Math.round(
      ((this.completedSessionJobs * 100) + currentJobProgress) / this.totalSessionJobs
    )));

    const title = "Downloading Chapters";
    const progressBarText = this.getTextProgressBar(overallProgress);
    const activeCountText = `${this.completedSessionJobs + (downloadingJob ? 1 : 0)}/${this.totalSessionJobs}`;
    const body = `${progressBarText} ${overallProgress}% (Chapter ${activeCountText})`;

    const NOTIFICATION_ID = 999999;

    try {
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: NOTIFICATION_ID,
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

  private async finishSessionNotification() {
    this.isSessionActive = false;
    const NOTIFICATION_ID = 999999;
    const title = "Downloads Complete";
    const body = `[██████████] 100% (Successfully processed ${this.totalSessionJobs} chapters)`;

    try {
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: NOTIFICATION_ID,
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
      coverUrl,
    };

    // Start a new session if no pending/downloading jobs are currently active
    const activeOrPending = this.jobs.some(j => j.status === 'pending' || j.status === 'downloading');
    if (!activeOrPending) {
      this.totalSessionJobs = 0;
      this.completedSessionJobs = 0;
      this.isSessionActive = true;
      if (Capacitor.isNativePlatform()) {
        UpdatePlugin.startBackgroundService().catch(e => console.warn("Failed to start background service:", e));
      }
      this.startSilentAudio();
    }

    this.totalSessionJobs++;

    this.jobs.push(job);
    this.notify();
    this.updateQueueNotification(true);
    this.processQueue();
  }

  addJobs(chapters: { title: string; url: string }[], seriesTitle: string, source: string, mode: 'save' | 'download', coverUrl: string | null) {
    this.requestPermission();

    let addedCount = 0;
    const notificationId = Math.floor(Math.random() * 1000000) + 1;

    for (const chapter of chapters) {
      if (this.jobs.some(j => j.id === chapter.url && (j.status === 'pending' || j.status === 'downloading'))) {
        continue;
      }

      this.jobs = this.jobs.filter(j => j.id !== chapter.url);

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
        coverUrl,
      };

      this.jobs.push(job);
      addedCount++;
    }

    if (addedCount > 0) {
      const activeOrPending = this.jobs.some(j => j.status === 'pending' || j.status === 'downloading');
      if (!activeOrPending || !this.isSessionActive) {
        this.totalSessionJobs = 0;
        this.completedSessionJobs = 0;
        this.isSessionActive = true;
        if (Capacitor.isNativePlatform()) {
          UpdatePlugin.startBackgroundService().catch(e => console.warn("Failed to start background service:", e));
        }
        this.startSilentAudio();
      }

      this.totalSessionJobs += addedCount;

      this.notify();
      this.updateQueueNotification(true);
      this.processQueue();
    }
  }

  private async processQueue() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      let changed = false;
      this.jobs.forEach(j => {
        if (j.status === 'pending' && j.statusText !== 'Paused: Waiting for connection...') {
          j.statusText = 'Paused: Waiting for connection...';
          changed = true;
        }
      });
      if (changed) {
        this.notify();
        this.updateQueueNotification(true);
      }
      return;
    }

    if (this.activeCount >= this.maxConcurrent) return;

    const nextJob = this.jobs.find(j => j.status === 'pending');
    if (!nextJob) {
      // Check if all active downloads have fully completed/failed
      const activeOrPending = this.jobs.some(j => j.status === 'pending' || j.status === 'downloading');
      if (!activeOrPending && this.isSessionActive) {
        this.finishSessionNotification();
        this.notify();
        if (Capacitor.isNativePlatform()) {
          UpdatePlugin.stopBackgroundService().catch(e => console.warn("Failed to stop background service:", e));
        }
        this.stopSilentAudio();
      }
      return;
    }

    this.activeCount++;
    nextJob.status = 'downloading';
    nextJob.statusText = 'Starting...';
    this.notify();
    this.updateQueueNotification(true);

    try {
      await this.runJob(nextJob);
      nextJob.status = 'completed';
      nextJob.progress = 100;
      nextJob.statusText = 'Complete!';
      this.completedSessionJobs++;
      this.updateQueueNotification(true);
    } catch (err: any) {
      console.error("Background download job failed:", err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        nextJob.status = 'pending';
        nextJob.statusText = 'Paused: Waiting for connection...';
        this.updateQueueNotification(true);
      } else {
        nextJob.status = 'failed';
        nextJob.statusText = err.message || 'Failed';
        this.completedSessionJobs++;
        this.updateQueueNotification(true);
      }
    } finally {
      this.activeCount--;
      this.notify();
      
      // Auto-remove completed/failed jobs after 10 seconds from visible queue
      setTimeout(() => {
        this.jobs = this.jobs.filter(j => j.id !== nextJob.id);
        delete this.lastNotificationTimes[nextJob.id];
        this.notify();

        // Once the queue is completely empty of visible items, clean up the session
        if (this.jobs.length === 0) {
          this.isSessionActive = false;
          this.totalSessionJobs = 0;
          this.completedSessionJobs = 0;
          this.notify();
          if (Capacitor.isNativePlatform()) {
            UpdatePlugin.stopBackgroundService().catch(e => console.warn("Failed to stop background service:", e));
          }
          this.stopSilentAudio();
        }
      }, 10000);

      // Process next in queue
      this.processQueue();
    }
  }

  private async runJob(job: DownloadJob) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    // 1. Fetch Page URLs
    job.statusText = 'Fetching pages...';
    this.notify();
    this.updateQueueNotification();

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

    job.totalPages = imgs.length;
    job.downloadedPages = 0;
    this.notify();

    // 2. Download pages concurrently in batches of 2 (prevents memory spikes and crashes on phones)
    const zip = new JSZip();
    const concurrencyLimit = 2;

    const downloadPage = async (pageUrl: string, index: number) => {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const buffer = await fetchImageAsArrayBuffer(pageUrl);
          return { index, buffer, success: true };
        } catch (err) {
          lastErr = err;
          console.warn(`Failed to fetch page ${index + 1} (attempt ${attempt + 1}/5):`, err);
          // Wait with exponential backoff: 1.5s, 3s, 4.5s...
          await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
        }
      }
      console.error(`Failed to fetch page ${index + 1} after 5 attempts:`, lastErr);
      return { index, buffer: null, success: false };
    };

    let failedPagesCount = 0;
    
    for (let i = 0; i < imgs.length; i += concurrencyLimit) {
      const chunk = imgs.slice(i, i + concurrencyLimit);
      const promises = chunk.map((url, idx) => downloadPage(url, i + idx));
      const chunkResults = await Promise.all(promises);
      
      for (const res of chunkResults) {
        if (res.success && res.buffer) {
          const pageUrl = imgs[res.index];
          const ext = pageUrl.split('?')[0].split('.').pop() || 'jpg';
          const validExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase()) ? ext : 'jpg';
          const fileName = `${String(res.index + 1).padStart(3, '0')}.${validExt}`;
          zip.file(fileName, res.buffer);
        } else {
          failedPagesCount++;
        }
      }
      
      const completedCount = Math.min(imgs.length, i + chunk.length);
      const percent = Math.round((completedCount / imgs.length) * 75); // 0-75% progress
      
      job.progress = percent;
      job.downloadedPages = completedCount;
      job.statusText = `Downloaded ${completedCount}/${imgs.length} pages...`;
      this.notify();
      this.updateQueueNotification();
    }

    if (failedPagesCount > 0) {
      throw new Error(`Failed to download ${failedPagesCount}/${imgs.length} pages (interrupted/offline).`);
    }

    job.progress = 78;
    job.statusText = 'Packaging CBZ...';
    this.notify();
    this.updateQueueNotification();

    const cbzBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    if (cbzBlob.size < 1000) {
      throw new Error("Failed to package manga pages into CBZ.");
    }

    // 3. Upload CBZ to Supabase Storage
    job.progress = 80;
    job.statusText = 'Uploading...';
    this.notify();
    this.updateQueueNotification();

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
    this.updateQueueNotification();

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
        cover_url: job.coverUrl ? `/api-image-proxy?url=${encodeURIComponent(job.coverUrl)}` : null,
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
    this.updateQueueNotification();

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
        cover_url: job.coverUrl ? `/api-image-proxy?url=${encodeURIComponent(job.coverUrl)}` : null,
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
      this.updateQueueNotification();

      // 1. Prepare buffers before opening IndexedDB transaction (prevents transaction deactivation)
      const arrayBuffer = await cbzBlob.arrayBuffer();
      
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

      // 2. Write both records synchronously in one transaction
      const db = await openLocalDB();
      const transaction = db.transaction(['offline-books', 'offline-files'], 'readwrite');
      
      let finalCoverUrl = insertedBook.cover_url;
      if (coverBlobData) {
        try {
          const bytes = new Uint8Array(coverBlobData);
          let binary = '';
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          finalCoverUrl = `data:image/jpeg;base64,${window.btoa(binary)}`;
        } catch (e) {
          console.warn("Failed to encode cover data to base64:", e);
        }
      }

      const offlineBook = {
        id: insertedBook.id,
        title: insertedBook.title,
        author: insertedBook.author,
        file_type: insertedBook.file_type,
        cover_url: finalCoverUrl,
        last_page_read: 0,
        cachedAt: Date.now(),
        fileSize: cbzBlob.size,
        series: insertedBook.series,
        file_url: fileUrl,
        cover_migrated: true,
      };

      transaction.objectStore('offline-books').put(offlineBook);
      
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

      // Also save to local-files store so proxy's offline createSignedUrl can find it
      try {
        const filePath = `book-files/${insertedBook.id}.cbz`;
        await saveLocalFile(filePath, cbzBlob);
      } catch (e) {
        console.warn('Failed to save CBZ to local-files store:', e);
      }
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
