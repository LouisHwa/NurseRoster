"use client";

import { useEffect, useState } from "react";
import { useNurseData } from "@/app/hooks/useNurseData"; 
import HistoryTable from "@/components/HistoryTable";
import HistoryFilter from "@/components/HistoryFilter";

export default function HistoryPage() {
  const [historyData, setHistoryData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use the custom hook for nurse data
  const { nurseLookup, loading: nurseLoading, error: nurseError } = useNurseData();

  // 🔹 Fetch history data from /api/history
  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch("/api/history");
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const historyApiData = await response.json();
        console.log("📊 Raw history data from API:", historyApiData);

        // Process and flatten the data from S3 files
        const processedData = processHistoryFiles(historyApiData);
        console.log("🎯 Processed data:", processedData);
        
        setHistoryData(processedData);

        // Extract unique weeks and departments
        const weekList = [...new Set(processedData.map((item) => item.week))].filter(Boolean).sort();
        const deptList = [...new Set(processedData.map((item) => item.department))].filter(Boolean).sort();
        
        setWeeks(weekList);
        setDepartments(deptList);

        if (weekList.length > 0) {
          setSelectedWeek(weekList[weekList.length - 1]); // Default to latest week
        }
      } catch (err) {
        console.error("❌ Error loading history:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  // 🔹 Process S3 files into consistent format
  function processHistoryFiles(files) {
    const processed = [];
    
    files.forEach((file) => {
      if (file.departments && Array.isArray(file.departments)) {
        file.departments.forEach((dept) => {
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

  // 🔹 Extract week from S3 key if not in data
  function extractWeekFromKey(s3Key) {
    let match = s3Key.match(/(\d{4}-W\d{2})/);
    if (match) return match[1];
    
    match = s3Key.match(/week-(\d{4}-\d{2})/);
    if (match) return match[1];
    
    const filename = s3Key.split('/').pop().replace('.json', '');
    return filename || "Unknown";
  }

  // 🔹 Apply filters whenever week or dept changes
  useEffect(() => {
    if (!historyData.length) return;

    let filtered = historyData;
    
    if (selectedWeek && selectedWeek !== "All") {
      filtered = filtered.filter((item) => item.week === selectedWeek);
    }
    
    if (selectedDept && selectedDept !== "All") {
      filtered = filtered.filter((item) => item.department === selectedDept);
    }
    
    setFilteredData(filtered);
  }, [historyData, selectedWeek, selectedDept]);

  // Show loading state if either history or nurse data is loading
  if (loading || nurseLoading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading data from S3...</p>
      </div>
    );
  }

  // Show error if either history or nurse data failed
  if (error || nurseError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">Error Loading Data</h2>
          <p className="text-red-700 mt-2">{error || nurseError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Roster History</h1>
        <p className="text-gray-600">
          Showing {filteredData.length} record(s) from {historyData.length} total
        </p>
        {nurseError && (
          <p className="text-amber-600 text-sm mt-1">
            ⚠️ Nurse names may not display correctly (using nurse IDs instead)
          </p>
        )}
      </div>

      <HistoryFilter
        weeks={weeks}
        selectedWeek={selectedWeek}
        onWeekChange={setSelectedWeek}
        departments={departments}
        selectedDept={selectedDept}
        onDeptChange={setSelectedDept}
      />

      <HistoryTable data={filteredData} nurseLookup={nurseLookup} />
    </div>
  );
}