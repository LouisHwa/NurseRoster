// src/utils/scheduleTransform.js

// Step 1: Nested transform (used in DepartmentTimetable)
export function transformScheduleData(jsonData) {
  const transformed = {};

  const dayMapping = {
    Mon: "monday",
    Tue: "tuesday",
    Wed: "wednesday",
    Thu: "thursday",
    Fri: "friday",
    Sat: "saturday",
    Sun: "sunday",
  };

  const shiftMapping = {
    "Full-Morning": "Morning",
    "Half-Morning": "Morning",
    "Full-Evening": "Evening",
    "Half-Evening": "Evening",
    "Full-Night": "Night",
    "Half-Night": "Night",
  };

  jsonData.departments.forEach((department) => {
    const deptId = department.name.toLowerCase();
    transformed[deptId] = {};

    const shifts = ["Morning", "Evening", "Night"];
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    shifts.forEach((shift) => {
      transformed[deptId][shift] = {};
      days.forEach((day) => {
        transformed[deptId][shift][day] = [];
      });
    });

    department.nurses.forEach((nurse) => {
      nurse.shifts.forEach((nurseShift) => {
        const day = dayMapping[nurseShift.day];
        const shift = shiftMapping[nurseShift.shift];
        const shiftType = nurseShift.shift.includes("Full") ? "full" : "half";

        if (day && shift) {
          transformed[deptId][shift][day].push({
            id: nurse.id,
            name: nurse.name || `Nurse ${nurse.id}`,
            shiftType,
            originalShift: nurseShift.shift,
          });
        }
      });
    });
  });

  return transformed;
}

// Step 2: Flatten transform (used in HistoryTable)
export function flattenScheduleData(scheduleData) {
  const flat = {};

  for (const dept in scheduleData) {
    flat[dept] = [];

    for (const shift in scheduleData[dept]) {
      for (const day in scheduleData[dept][shift]) {
        scheduleData[dept][shift][day].forEach((nurse) => {
          flat[dept].push({
            day,
            shift,
            nurse: nurse.name || `Nurse ${nurse.id}`,
            shiftType: nurse.shiftType,
            originalShift: nurse.originalShift,
          });
        });
      }
    }
  }

  return flat;
}
