"use client";

import { useEffect } from "react";
import ShiftCell from "@/components/ShiftCell";

export default function DepartmentTimetable({
  department,
  days,
  shifts,
  searchTerm,
  scheduleData,
  nurseLookup,
}) {
  // ----------------- SAFETY CHECKS -----------------
  if (!department) return <div className="bg-red-100 p-4 rounded">No department data</div>;
  if (!days || !Array.isArray(days) || days.length === 0) return <div className="bg-red-100 p-4 rounded">Invalid days data</div>;
  if (!scheduleData) return <div className="bg-red-100 p-4 rounded">No schedule data</div>;
  if (!shifts || !Array.isArray(shifts) || shifts.length === 0) return <div className="bg-red-100 p-4 rounded">Invalid shifts data</div>;

  const departmentSchedule = scheduleData[department.id];
  if (!departmentSchedule) {
    return (
      <div className="bg-white-100 border border-yellow-300 p-4 rounded mb-4">
        <h3 className="font-semibold text-yellow-800">Department Not Found</h3>
        <p className="text-yellow-700">Department '{department.name}' not found in schedule data.</p>
        <p className="text-sm text-yellow-600 mt-2">Available: {Object.keys(scheduleData).join(', ')}</p>
      </div>
    );
  }

  // ----------------- UTILITY FUNCTIONS -----------------
  const getAssignedNurses = (deptId, shift, dayId) => scheduleData[deptId]?.[shift]?.[dayId] || [];

  const safeDays = days.map((day, index) => ({
    id: day?.id || `day-${index}`,
    name: day?.name || `Day ${index + 1}`,
    date: day?.date instanceof Date ? day.date : new Date(),
  }));

  // ----------------- TOTAL ASSIGNMENTS -----------------
  let totalAssignments = 0;
  shifts.forEach(shift => {
    safeDays.forEach(day => {
      totalAssignments += getAssignedNurses(department.id, shift, day.id).length;
    });
  });

  // ----------------- HIGHLIGHT EFFECT -----------------
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) return;

    // Clear previous highlights
    document.querySelectorAll(".highlighted-cell").forEach(el => el.classList.remove("highlighted-cell"));

    const searchLower = searchTerm.toLowerCase();

    safeDays.forEach(day => {
      shifts.forEach(shift => {
        const cellId = `${department.id}-${shift}-${day.id}`;
        const cell = document.getElementById(cellId);
        if (!cell) return;

        const nurses = getAssignedNurses(department.id, shift, day.id);

        // Only highlight if any nurse matches
        const hasMatch = nurses.some(nurse => {
          const nurseIdStr = nurse.id != null ? String(nurse.id).toLowerCase() : "";
          const nurseNameStr = nurseLookup?.[nurse.id] != null ? String(nurseLookup[nurse.id]).toLowerCase() : "";
          return nurseIdStr.includes(searchLower) || nurseNameStr.includes(searchLower);
        });

        if (hasMatch) {
          cell.classList.add("highlighted-cell");
          setTimeout(() => cell.classList.remove("highlighted-cell"), 3000);
        }
      });
    });
  }, [searchTerm, department.id, safeDays, shifts, scheduleData, nurseLookup]);

  // ----------------- RENDER -----------------
  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Department: {department.name}</h2>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">{totalAssignments} assignments</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 p-3 font-semibold">Shift</th>
              {safeDays.map(day => {
                let dateString = "N/A";
                try {
                  dateString = day.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                } catch (e) {}
                return (
                  <th key={day.id} className="border border-gray-300 p-3 min-w-32">
                    <div className="flex flex-col items-center">
                      <span className="text-sm">{day.name}</span>
                      <span className="text-xs text-black-600 font-medium">{dateString}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shifts.map(shift => (
              <tr key={shift}>
                <td className="border border-gray-300 p-3 font-semibold bg-gray-50">{shift}</td>
                {safeDays.map(day => {
                  const assignedNurses = getAssignedNurses(department.id, shift, day.id);
                  return (
                    <td
                      key={`${shift}-${day.id}`}
                      id={`${department.id}-${shift}-${day.id}`} // <-- unique ID for highlight
                      className="border border-gray-300 align-top"
                    >
                      <ShiftCell nurses={assignedNurses} searchTerm={searchTerm} nurseLookup={nurseLookup || {}} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
