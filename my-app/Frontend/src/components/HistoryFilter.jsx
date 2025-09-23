"use client";

export default function HistoryFilter({
  weeks,
  selectedWeek,
  onWeekChange,
  departments,
  selectedDept,
  onDeptChange,
}) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
      <h3 className="font-semibold mb-3 text-gray-700">Filter History</h3>
      
      <div className="flex flex-wrap gap-4">
        {/* Week filter */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-600 mb-1">Week</label>
          <select
            className="border border-gray-300 p-2 rounded-md bg-white min-w-[140px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={selectedWeek}
            onChange={(e) => onWeekChange(e.target.value)}
          >
            <option value="All">All Weeks</option>
            {weeks.map((week) => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
        </div>

        {/* Department filter */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-600 mb-1">Department</label>
          <select
            className="border border-gray-300 p-2 rounded-md bg-white min-w-[140px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={selectedDept}
            onChange={(e) => onDeptChange(e.target.value)}
          >
            <option value="All">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept.charAt(0).toUpperCase() + dept.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Clear filters button */}
        <div className="flex flex-col justify-end">
          <button
            onClick={() => {
              onWeekChange("All");
              onDeptChange("All");
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
}