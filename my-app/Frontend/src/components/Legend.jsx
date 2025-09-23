// src/app/components/Legend.js
"use client";

export default function Legend() {
  return (
    <div className="flex gap-4 mt-4 text-sm">
      <span className="flex items-center gap-1">
        <span className="w-4 h-4 bg-green-200 rounded"></span> Full-Shift
      </span>
      <span className="flex items-center gap-1">
        <span className="w-4 h-4 bg-yellow-200 rounded"></span> Half-Shift
      </span>
      <span className="flex items-center gap-1">
        <span className="w-4 h-4 ring-2 ring-blue-500 rounded"></span> Search Highlight
      </span>
    </div>
  );
}
