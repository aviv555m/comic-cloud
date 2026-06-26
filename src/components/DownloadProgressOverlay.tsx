import { useDownloadJobs } from '@/lib/download-manager';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export const DownloadProgressOverlay = () => {
  const jobs = useDownloadJobs();
  const activeJobs = jobs.filter(j => j.status === 'downloading' || j.status === 'pending');

  if (activeJobs.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[90%] max-w-sm flex flex-col gap-3 pointer-events-auto">
      {activeJobs.map(job => (
        <Card key={job.id} className="border-violet-500/20 bg-background/90 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-violet-400 truncate uppercase tracking-wider">
                  {job.mode === 'download' ? 'Downloading Offline' : 'Saving to Library'}
                </p>
                <h4 className="text-sm font-bold truncate text-foreground mt-0.5">
                  {job.series} - {job.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {job.statusText}
                </p>
              </div>
              <div className="shrink-0">
                {job.status === 'downloading' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2.5">
              <Progress value={job.progress} className="h-1.5 flex-1 bg-violet-950/40" />
              <span className="text-[10px] font-bold text-muted-foreground w-8 text-right font-mono">
                {job.progress}%
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
