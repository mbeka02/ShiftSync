import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingSchedule() {
  return <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"><div><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-10 w-64" /></div><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>;
}
