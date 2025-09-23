// src/app/components/FilterControls.js
"use client";

export default function FilterControls({ 
  departments, 
  selectedDept, 
  onDeptChange, 
  searchTerm, 
  onSearchChange 
}) {
  return (
    <div className="flex gap-4 mb-6">
      <select
        className="border p-2 rounded bg-blue-50"
        value={selectedDept}
        onChange={(e) => onDeptChange(e.target.value)}
      >
        <option value="All">All Departments</option>
        {departments.map((dept) => (
          <option key={dept.id} value={dept.id}>
            {dept.name}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Search nurse..."
        className="border p-2 rounded flex-1"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}