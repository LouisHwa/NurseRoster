// Fixed ShiftCell component - matching your DepartmentTimetable props
import React from 'react';
import NurseCard from './NurseCard';

export default function ShiftCell({ 
  nurses = [],        // ✅ Changed from 'assignedNurses' to 'nurses' to match DepartmentTimetable
  nurseLookup = {}, 
  searchTerm = '' 
}) {
  
  console.log("ShiftCell received nurses:", nurses); // Debug log
  
  if (!nurses || nurses.length === 0) {
    return (
      <div className="p-2 text-center text-gray-400 min-h-12">
        No assignments
      </div>
    );
  }

  return (
    <div className="p-2 min-h-12">
      <div className="flex flex-wrap gap-1">
        {nurses.map((nurse, index) => {
          // Make sure nurse is an object with id property
          if (!nurse || typeof nurse !== 'object' || !nurse.id) {
            console.warn('Invalid nurse object:', nurse);
            return (
              <div key={index} className="text-xs text-red-500 bg-red-100 px-2 py-1 rounded">
                Invalid nurse data
              </div>
            );
          }

          return (
            <NurseCard
              key={`${nurse.id}-${index}`}
              nurse={{
                id: nurse.id,
                name: nurse.name,
                shiftType: nurse.shiftType || 'full'
              }}
              nurseLookup={nurseLookup}
              searchTerm={searchTerm}
            />
          );
        })}
      </div>
    </div>
  );
}