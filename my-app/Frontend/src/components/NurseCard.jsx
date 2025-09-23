// Simplified NurseCard component - shows only name and ID
import React from 'react';

export default function NurseCard({ nurse, nurseLookup = {}, searchTerm = '' }) {
  // Get nurse name from lookup or use the nurse's name or ID as fallback
  const nurseName = nurseLookup[nurse.id]?.name || nurse.name || nurse.id;

  // Highlight search term
  const highlightText = (text, searchTerm) => {
    if (!searchTerm || !text) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className={`
      m-1 px-3 py-2 rounded text-sm cursor-pointer transition-colors
      flex flex-col items-center justify-center text-center
      min-h-16 w-full
      ${nurse.shiftType === 'full' 
        ? 'bg-green-200 hover:bg-green-300' 
        : 'bg-yellow-200 hover:bg-yellow-300'
      }
    `}>
      {/* Nurse Name */}
      <div className="font-medium text-sm">
        {highlightText(nurseName, searchTerm)}
      </div>
      
      {/* Nurse ID (only show if different from name) */}
      {nurseName !== nurse.id && (
        <div className="text-sm text-gray-600 mt-1">
          ID: {nurse.id}
        </div>
      )}
    </div>
  );
}