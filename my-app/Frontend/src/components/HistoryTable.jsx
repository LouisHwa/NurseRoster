"use client";

import { transformScheduleData } from '@/utils/scheduleTransform';

// Utility: parse week string to get Monday date
function parseWeekToMondayDate(weekString) {
  console.log("🗓️ Parsing week string:", weekString);
  
  // Handle formats like "2025-09-15", "Week of 2025-09-15"
  const dateMatch = weekString.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const inputDate = new Date(dateMatch[1] + 'T00:00:00'); // Add time to avoid timezone issues
    console.log("📅 Input date:", inputDate);
    
    // Check what day of the week this date falls on
    const dayOfWeek = inputDate.getDay(); // 0=Sunday, 1=Monday...
    console.log("📊 Day of week:", dayOfWeek, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek]);
    
    // Calculate how many days to subtract to get to Monday
    let daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days
    
    const mondayDate = new Date(inputDate);
    mondayDate.setDate(inputDate.getDate() - daysToSubtract);
    
    console.log("🎯 Calculated Monday date:", mondayDate);
    return mondayDate;
  }
  
  // Handle ISO week format like "2025-W38"
  const weekMatch = weekString.match(/(\d{4})-W(\d{2})/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1]);
    const week = parseInt(weekMatch[2]);
    return getDateFromWeekNumber(year, week);
  }
  
  // Fallback to current week if can't parse
  console.warn("⚠️ Could not parse week string, using current week");
  return getStartOfWeek(new Date());
}

// Utility: convert ISO week number to Monday date
function getDateFromWeekNumber(year, week) {
  const firstMonday = new Date(year, 0, 1);
  const dayOfWeek = firstMonday.getDay();
  const daysToAdd = (dayOfWeek === 0 ? 1 : 8 - dayOfWeek) + (week - 1) * 7;
  
  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + daysToAdd);
  return monday;
}

// Utility: get start of current week (Monday) - fallback function
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday, 1=Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust so Monday
  return new Date(d.setDate(diff));
}

// Utility: generate 7 days starting from Monday for a specific week
function generateWeek(mondayDate) {
  const daysOfWeek = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ];
  const abbr = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const days = [];
  const start = new Date(mondayDate);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + (i * 24 * 60 * 60 * 1000));
    days.push({
      id: daysOfWeek[i].toLowerCase(), // e.g. "monday"
      abbr: abbr[i],                   // e.g. "Mon"
      name: daysOfWeek[i],             // e.g. "Monday"
      date: d
    });
  }
  return days;
}

export default function HistoryTable({ data, nurseLookup = {}, searchTerm = '' }) {
  // Highlight search term function
  const highlightText = (text, searchTerm) => {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 font-bold">{part}</span>
      ) : (
        part
      )
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-lg">No history found for the selected filters.</p>
        <p className="text-gray-400 text-sm mt-2">Try selecting different week or department filters.</p>
      </div>
    );
  }

  const shifts = ['Morning', 'Evening', 'Night'];

  return (
    <div className="space-y-8">
      {data.map((departmentData, idx) => {
        // Get the correct Monday date for this historical week
        const mondayDate = parseWeekToMondayDate(departmentData.week);
        const days = generateWeek(mondayDate);

        // Transform the department data to match the timetable format
        const scheduleData = transformScheduleData({
          departments: [{
            name: departmentData.department,
            nurses: departmentData.nurses
          }]
        });

        const deptId = departmentData.department.toLowerCase();

        // Get assigned nurses for a specific shift and day
        const getAssignedNurses = (shift, dayId) => {
          return scheduleData[deptId]?.[shift]?.[dayId] || [];
        };

        return (
          <div key={`${departmentData.week}-${departmentData.department}-${idx}`} 
               className="border rounded-lg shadow-md bg-white overflow-hidden">
            
            {/* Department Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    Department: {departmentData.department.charAt(0).toUpperCase() + 
                     departmentData.department.slice(1)}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    {departmentData.week} • {departmentData.nurses?.length || 0} Nurse(s)
                  </p>
                  <p className="pt-2 text-sm text-blue-600">
                    Week of {mondayDate.toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'short', 
                      day: 'numeric' 
                    })} - {new Date(mondayDate.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                {departmentData.metadata && (
                  <div className="text-right text-sm text-gray-500">
                    <p>File: {departmentData.metadata.s3Key?.split('/').pop()}</p>
                    {departmentData.metadata.lastModified && (
                      <p>Updated: {new Date(departmentData.metadata.lastModified).toLocaleDateString()}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Timetable Display */}
            <div className="p-6">
              <table className="w-full border-collapse border text-center">
                <thead>
                  <tr>
                    <th className="border p-2 font-semibold">Shift</th>
                    {days.map((day) => (
                      <th key={day.id} className="border p-2">
                        <div className="flex flex-col items-center">
                          <span className="font-medium text-sm">{day.name}</span>
                          <span className="text-xs text-black-600 font-medium">
                            {day.date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => (
                    <tr key={shift}>
                      <td className="border p-2 font-semibold text-sm">{shift}</td>
                      {days.map((day) => {
                        const assignedNurses = getAssignedNurses(shift, day.id);
                        
                        return (
                          <td key={`${shift}-${day.id}`} className="border p-2 min-h-[60px] align-top">
                            <div className="flex flex-wrap justify-center items-start gap-1">
                              {assignedNurses.length === 0 ? (
                                <span className="text-gray-400 text-xs italic py-2">No assignments</span>
                              ) : (
                                assignedNurses.map((nurse, nurseIdx) => {
                                  // Get nurse name from lookup or use the nurse's name or ID as fallback
                                  const nurseName = nurseLookup[nurse.id]?.name || nurse.name || nurse.id;
                                  
                                  return (
                                    <div
                                      key={`${nurse.id}-${nurseIdx}`}
                                      className={`m-1 px-3 py-2 rounded text-sm cursor-pointer transition-colors flex flex-col items-center justify-center text-center min-h-16 w-full ${
                                        nurse.shiftType === 'full' 
                                          ? 'bg-green-200 hover:bg-green-300' 
                                          : 'bg-yellow-200 hover:bg-yellow-300'
                                      }`}
                                    >
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
                                })
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="bg-gray-50 px-6 py-3 border-t">
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  Total Shifts: {
                    departmentData.nurses?.reduce((total, nurse) => 
                      total + (nurse.shifts?.length || 0), 0
                    ) || 0
                  }
                </span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    Full Shifts: {
                      departmentData.nurses?.reduce((total, nurse) => 
                        total + (nurse.shifts?.filter(s => s.shift?.includes('Full'))?.length || 0), 0
                      ) || 0
                    }
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    Half Shifts: {
                      departmentData.nurses?.reduce((total, nurse) => 
                        total + (nurse.shifts?.filter(s => s.shift?.includes('Half'))?.length || 0), 0
                      ) || 0
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}