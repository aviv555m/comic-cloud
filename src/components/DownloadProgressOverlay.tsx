import { useDownloadJobs, downloadQueue } from '@/lib/download-manager';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export const DownloadProgressOverlay = () => {
  const jobs = useDownloadJobs();
  const stats = downloadQueue.getSessionStats();

  if ((!stats.active && !stats.finished) || stats.total === 0) return null;

  // Find the current downloading job to show what it is processing
  const currentJob = jobs.find(j => j.status === 'downloading');
  const currentJobProgress = currentJob ? currentJob.progress : 0;

  // Calculate overall progress based on finished jobs + currently downloading job progress
  const overallProgress = Math.min(100, Math.max(0, Math.round(
    ((stats.completed * 100) + currentJobProgress) / stats.total
  )));

  // stats.completed counts failures too, so successes have to be backed out of it
  const isFinished = stats.finished || stats.completed >= stats.total;
  const hasFailures = stats.failed > 0;
  const succeeded = Math.max(0, stats.total - stats.failed);
  const isPaused = stats.paused && !isFinished;

  const label = isFinished
    ? (hasFailures ? 'Downloads Finished With Errors' : 'Downloads Complete')
    : isPaused
      ? 'Downloads Paused'
      : 'Downloading Chapters';

  const headline = isFinished
    ? (hasFailures ? `${succeeded} of ${stats.total} chapters saved` : 'All selected chapters ready')
    : isPaused
      ? 'Waiting for connection...'
      : currentJob
        ? `Processing: ${currentJob.series} - ${currentJob.title}`
        : 'Preparing download...';

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[90%] max-w-sm pointer-events-auto">
      <Card className="border-border bg-background/90 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
        <CardContent className="p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold truncate uppercase tracking-wider ${hasFailures ? 'text-destructive' : 'text-primary'}`}>
                {label}
              </p>
              <h4 className="text-sm font-bold truncate text-foreground mt-0.5">
                {headline}
              </h4>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>
                  {isFinished ? (
                    hasFailures ? (
                      <span className="font-semibold text-destructive">
                        {stats.failed} of {stats.total} chapters failed
                      </span>
                    ) : (
                      <span className="font-semibold text-emerald-400">
                        Successfully saved {stats.total} chapters
                      </span>
                    )
                  ) : (
                    <span className="font-semibold text-primary">
                      Chapter {stats.completed + (currentJob ? 1 : 0)} of {stats.total}
                      {hasFailures ? <span className="text-destructive"> · {stats.failed} failed</span> : null}
                    </span>
                  )}
                </span>
                <span className="font-mono font-bold text-primary">
                  {overallProgress}%
                </span>
              </div>
            </div>
            <div className="shrink-0 pt-0.5">
              {isFinished ? (
                hasFailures ? (
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                )
              ) : isPaused ? (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
            </div>
          </div>

          <Progress
            value={overallProgress}
            className={`h-2 w-full mt-1 ${hasFailures ? 'bg-destructive/20' : isFinished ? 'bg-emerald-950/40' : 'bg-primary/15'}`}
          />
        </CardContent>
      </Card>
    </div>
  );
};
