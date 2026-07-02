import { useDownloadJobs, downloadQueue } from '@/lib/download-manager';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export const DownloadProgressOverlay = () => {
  const jobs = useDownloadJobs();
  const stats = downloadQueue.getSessionStats();

  if (!stats.active || stats.total === 0) return null;

  // Find the current downloading job to show what it is processing
  const currentJob = jobs.find(j => j.status === 'downloading');
  const currentJobProgress = currentJob ? currentJob.progress : 0;

  // Calculate overall progress based on finished jobs + currently downloading job progress
  const overallProgress = Math.min(100, Math.max(0, Math.round(
    ((stats.completed * 100) + currentJobProgress) / stats.total
  )));

  const isFinished = stats.completed === stats.total;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[90%] max-w-sm pointer-events-auto">
      <Card className="border-violet-500/20 bg-background/90 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
        <CardContent className="p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-violet-400 truncate uppercase tracking-wider">
                {isFinished ? 'Downloads Complete' : 'Downloading Chapters'}
              </p>
              <h4 className="text-sm font-bold truncate text-foreground mt-0.5">
                {isFinished 
                  ? 'All selected chapters ready' 
                  : currentJob 
                    ? `Processing: ${currentJob.series} - ${currentJob.title}` 
                    : 'Preparing download...'}
              </h4>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>
                  {isFinished ? (
                    <span className="font-semibold text-emerald-400">
                      Successfully saved {stats.total} chapters
                    </span>
                  ) : (
                    <span className="font-semibold text-violet-300">
                      Chapter {stats.completed + (currentJob ? 1 : 0)} of {stats.total}
                    </span>
                  )}
                </span>
                <span className="font-mono font-bold text-violet-400">
                  {overallProgress}%
                </span>
              </div>
            </div>
            <div className="shrink-0 pt-0.5">
              {!isFinished ? (
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              )}
            </div>
          </div>
          
          <Progress 
            value={overallProgress} 
            className={`h-2 w-full mt-1 ${isFinished ? 'bg-emerald-950/40' : 'bg-violet-950/40'}`} 
          />
        </CardContent>
      </Card>
    </div>
  );
};
