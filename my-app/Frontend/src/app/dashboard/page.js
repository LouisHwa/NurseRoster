"use client";

import { useState, useEffect, useRef } from 'react';
import DepartmentTimetable from '@/components/DepartmentTimetable';
import FilterControls from '@/components/FilterControls';
import Legend from '@/components/Legend';
import LoadingSpinner from '@/components/LoadingSpinner';
import { transformScheduleData } from '@/utils/scheduleTransform';
import { useNurseData } from '@/app/hooks/useNurseData';

// Utility: get next Monday (or today if Monday)
function getNextMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 1) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysToAdd = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysToAdd);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Utility: generate 7 days starting from startDate
function generateWeek(startDate) {
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const abbr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [];
  const start = new Date(startDate);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    days.push({
      id: daysOfWeek[d.getDay()].toLowerCase(),
      abbr: abbr[d.getDay()],
      name: daysOfWeek[d.getDay()],
      date: d,
      dayNumber: d.getDate(),
    });
  }
  return days;
}

// Utility: format week as "Monday, Sep 22 – Sunday, Sep 28"
function formatDateRange(days) {
  if (!days || days.length !== 7) return '';
  const options = { month: 'short', day: 'numeric' };
  const startDate = days[0].date.toLocaleDateString('en-US', options);
  const endDate = days[6].date.toLocaleDateString('en-US', options);
  return `${days[0].name}, ${startDate} – ${days[6].name}, ${endDate}`;
}

export default function DashboardPage() {
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDept, setSelectedDept] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [days, setDays] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [dateRange, setDateRange] = useState('');
  const [currentWeek, setCurrentWeek] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const departmentRefs = useRef({});

  const { nurseLookup, loading: nurseLoading, error: nurseError } = useNurseData();
  const shifts = ['Morning', 'Evening', 'Night'];

  useEffect(() => {
    async function loadLatestRoster() {
      try {
        setLoading(true);
        setError(null);

        const startOfWeek = getNextMonday(new Date());
        const weekDays = generateWeek(startOfWeek);
        setDays(weekDays);
        setDateRange(formatDateRange(weekDays));

        const response = await fetch("/api/history");
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const historyApiData = await response.json();

        const processedData = processHistoryFiles(historyApiData);
        if (!processedData || processedData.length === 0) throw new Error("No roster history found");

        const weekList = [...new Set(processedData.map(item => item.week))].filter(Boolean).sort();
        const latestWeek = weekList[weekList.length - 1];
        const latestWeekData = processedData.filter(item => item.week === latestWeek);

        const departmentMap = new Map();
        latestWeekData.forEach(item => {
          if (!departmentMap.has(item.department)) {
            departmentMap.set(item.department, {
              name: item.department.charAt(0).toUpperCase() + item.department.slice(1),
              nurses: []
            });
          }
          if (item.nurses && Array.isArray(item.nurses)) {
            const existingNurses = departmentMap.get(item.department).nurses;
            const nurseIds = new Set(existingNurses.map(n => n.id));
            item.nurses.forEach(nurse => {
              if (!nurseIds.has(nurse.id)) {
                existingNurses.push(nurse);
                nurseIds.add(nurse.id);
              }
            });
          }
        });

        const latestData = {
          success: true,
          week: latestWeek,
          departments: Array.from(departmentMap.values()),
          lastModified: Date.now()
        };

        setCurrentWeek(latestData.week);
        setLastUpdated(new Date(latestData.lastModified));

        const transformedDepartments = latestData.departments.map(dept => ({
          id: dept.name.toLowerCase(),
          name: dept.name
        }));
        setDepartments(transformedDepartments);

        const transformed = transformScheduleData(latestData);
        setScheduleData(transformed);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    function processHistoryFiles(files) {
      const processed = [];
      files.forEach(file => {
        if (file.departments && Array.isArray(file.departments)) {
          file.departments.forEach(dept => {
            processed.push({
              week: file.week || extractWeekFromKey(file.s3Key),
              department: dept.name.toLowerCase(),
              nurses: dept.nurses || [],
              totalNurses: dept.nurses ? dept.nurses.length : 0,
              metadata: {
                s3Key: file.s3Key,
                lastModified: file.lastModified,
                size: file.size,
              }
            });
          });
        }
      });
      return processed;
    }

    function extractWeekFromKey(s3Key) {
      let match = s3Key.match(/(\d{4}-W\d{2})/);
      if (match) return match[1];
      match = s3Key.match(/week-(\d{4}-\d{2})/);
      if (match) return match[1];
      const filename = s3Key.split('/').pop().replace('.json', '');
      return filename || "Unknown";
    }

    loadLatestRoster();
  }, []);

  // ------------------ Search + Scroll Integration ------------------
  const findNurseDepartment = (searchInput) => {
    if (!scheduleData) return null;
    const searchLower = searchInput.toLowerCase();

    for (const [deptId, deptSchedule] of Object.entries(scheduleData)) {
      for (const shift of shifts) {
        for (const day of days) {
          const nurses = deptSchedule[shift]?.[day.id] || [];
          const nurseExists = nurses.some(nurse => {
            const nurseName = nurseLookup[nurse.id];
            const nameStr = nurseName && typeof nurseName === 'string' ? nurseName : '';
            return nurse.id.toLowerCase().includes(searchLower) || nameStr.toLowerCase().includes(searchLower);
          });
          if (nurseExists) return deptId;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (searchTerm.trim() && searchTerm.length >= 2 && scheduleData) {
      const nurseDept = findNurseDepartment(searchTerm.trim());
      
      if (nurseDept && departmentRefs.current[nurseDept]) {
        setTimeout(() => {
          if ('scrollBehavior' in document.documentElement.style) {
            departmentRefs.current[nurseDept].scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            const element = departmentRefs.current[nurseDept];
            const offsetTop = element.offsetTop - 100;
            window.scrollTo({ top: offsetTop, behavior: 'smooth' });
          }
        }, 150);
      }
    }
  }, [searchTerm, scheduleData, nurseLookup, days]);

  if (loading || nurseLoading) return <LoadingSpinner message="Loading latest nurse schedules..." />;

  if (error || nurseError) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-red-800 font-semibold text-lg mb-2">Error Loading Overview</h2>
            <p className="text-red-700 mb-4">{error || nurseError}</p>
            {error && error.includes("No roster history found") && (
              <div className="bg-blue-50 border border-blue-200 rounded p-4 mt-4">
                <h3 className="text-blue-800 font-medium mb-2">📋 No Roster Data Available</h3>
                <p className="text-blue-700 text-sm">
                  It looks like there are no roster files in your S3 bucket yet. 
                  Make sure you have uploaded some roster data to the "historical/" folder.
                </p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredDepartments =
    selectedDept === "All" || !selectedDept
      ? departments
      : departments.filter(dept => dept.id === selectedDept);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Nurse Roster - Current Overview</h1>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              {currentWeek && (
                <p className="text-gray-600 mb-1">
                  📅 Showing latest data: <span className="font-semibold text-blue-600">{currentWeek}</span>
                </p>
              )}
              {lastUpdated && (
                <p className="text-sm text-gray-500">
                  🕒 Last updated: {lastUpdated.toLocaleDateString()} at {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
            <div className="mt-2 sm:mt-0">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                🔴 Live Data from S3
              </span>
            </div>
          </div>
        </div>
        
        <FilterControls
          departments={departments}
          selectedDept={selectedDept}
          onDeptChange={setSelectedDept}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        <Legend />

        {dateRange && (
          <div className="p-4 mb-1 pt-8">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-800 mb-1">
                  Weekly Schedule
                </h2>
                <p className="text-lg text-black-700 font-semibold">
                  {dateRange}
                </p>
              </div>
            </div>
          </div>
        )}

        {scheduleData && filteredDepartments.map(department => (
          <div 
            key={department.id}
            ref={el => departmentRefs.current[department.id] = el}
          >
            <DepartmentTimetable
              department={department}
              days={days}
              shifts={shifts}
              searchTerm={searchTerm}
              scheduleData={scheduleData}
              nurseLookup={nurseLookup}
            />
          </div>
        ))}

        {filteredDepartments.length === 0 && scheduleData && (
          <div className="text-center py-8">
            <p className="text-gray-500">No departments selected</p>
          </div>
        )}

        {!scheduleData && !loading && !error && (
          <div className="text-center py-8">
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">No Schedule Data</h3>
            <p className="text-gray-500">
              No roster schedule data is available to display.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
