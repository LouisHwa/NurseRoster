"use client";

export default function ErrorMessage({ error, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
      <h3 className="text-red-800 font-semibold">Error Loading Data</h3>
      <p className="text-red-600 mt-1">{error}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Try Again
        </button>
      )}
    </div>
  );
}