import React from 'react';

const Block = ({ className }) => <div className={`rounded bg-gray-200 dark:bg-gray-700 ${className}`} />;

export default function AdminPageSkeleton({ cards = 0, rows = 6 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading content">
      {cards > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: cards }).map((_, index) => (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <Block className="h-10 w-10" />
              <Block className="mt-5 h-4 w-24" />
              <Block className="mt-3 h-7 w-32" />
            </div>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 p-5 dark:border-gray-700"><Block className="h-5 w-44" /></div>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 last:border-0 dark:border-gray-700">
            <Block className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Block className="h-4 w-2/5" /><Block className="h-3 w-3/5" /></div>
            <Block className="h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
