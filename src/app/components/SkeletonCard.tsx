'use client';

export default function SkeletonCard() {
  return (
    <div className="bg-black/20 border border-white/10 rounded-xl overflow-hidden h-[180px] animate-pulse">

	  {/* Top Color Bar */}
      <div className="h-1.5 w-full bg-white/5"></div>

      <div className="p-4">
        {/* Header: Logo & Name */}
        <div className="flex gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-white/5"></div>
          <div className="flex flex-col gap-2 pt-1 w-full">
            <div className="h-4 w-3/4 bg-white/10 rounded"></div>
            <div className="h-3 w-1/3 bg-white/5 rounded"></div>
          </div>
        </div>

        {/* Price Row */}
        <div className="flex justify-between items-center mt-6">
          <div className="space-y-1">
            <div className="h-3 w-10 bg-white/5 rounded"></div>
            <div className="h-6 w-24 bg-white/10 rounded"></div>
          </div>
          <div className="space-y-1 flex flex-col items-end">
            <div className="h-3 w-10 bg-white/5 rounded"></div>
            <div className="h-6 w-16 bg-white/10 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}