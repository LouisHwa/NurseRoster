"use client";

import { useEffect, useState } from "react";

export default function NurseDetails({ nurseId = null }) {
  const [nurses, setNurses] = useState([]);
  const [nurseLookup, setNurseLookup] = useState({});
  const [selectedNurse, setSelectedNurse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch nurse data from S3 via API
  useEffect(() => {
    async function fetchNurseData() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch("/api/nurse-data");
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || "Failed to fetch nurse data");
        }
        
        console.log(`✅ Loaded ${data.count} nurses from S3`);
        
        setNurses(data.nurseData);
        setNurseLookup(data.nurseLookup);
        
        // If nurseId is provided, set it as selected
        if (nurseId && data.nurseLookup[nurseId]) {
          setSelectedNurse({
            nurse_id: nurseId,
            ...data.nurseLookup[nurseId]
          });
        }
        
      } catch (err) {
        console.error("❌ Error loading nurse data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchNurseData();
  }, [nurseId]);

  // Filter nurses based on search term
  const filteredNurses = nurses.filter(nurse => 
    nurse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nurse.nurse_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nurse.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleNurseSelect = (nurse) => {
    setSelectedNurse(nurse);
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading nurse data from S3...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">Error Loading Nurse Data</h2>
          <p className="text-red-700 mt-2">{error}</p>
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
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Nurse Details</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Nurse List Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4">All Nurses ({nurses.length})</h2>
            
            {/* Search Input */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search nurses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Nurse List */}
            <div className="max-h-96 overflow-y-auto">
              {filteredNurses.map((nurse) => (
                <div
                  key={nurse.nurse_id}
                  onClick={() => handleNurseSelect(nurse)}
                  className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                    selectedNurse?.nurse_id === nurse.nurse_id
                      ? "bg-blue-100 border-blue-300 border-2"
                      : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  <div className="font-medium text-gray-800">{nurse.name}</div>
                  <div className="text-sm text-gray-600">ID: {nurse.nurse_id}</div>
                  <div className="text-sm text-gray-500">
                    {nurse.experience_years} years • {nurse.seniority_level}
                  </div>
                </div>
              ))}
              
              {filteredNurses.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No nurses found matching your search.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Nurse Details Panel */}
        <div className="lg:col-span-2">
          {selectedNurse ? (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="border-b pb-4 mb-6">
                <h2 className="text-xl font-bold text-gray-800">{selectedNurse.name}</h2>
                <p className="text-gray-600">Nurse ID: {selectedNurse.nurse_id}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Experience:</span>
                      <span className="font-medium">{selectedNurse.experience_years} years</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Seniority Level:</span>
                      <span className="font-medium capitalize">{selectedNurse.seniority_level}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Skills Count:</span>
                      <span className="font-medium">{selectedNurse.skills.length}</span>
                    </div>
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Skills & Specializations</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedNurse.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Experience Level Indicator */}
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-lg font-semibold mb-3">Experience Level</h3>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      selectedNurse.experience_years >= 10
                        ? "bg-green-500"
                        : selectedNurse.experience_years >= 5
                        ? "bg-yellow-500"
                        : "bg-blue-500"
                    }`}
                    style={{
                      width: `${Math.min((selectedNurse.experience_years / 15) * 100, 100)}%`,
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm text-gray-600 mt-1">
                  <span>Junior (0-2 years)</span>
                  <span>Mid (3-7 years)</span>
                  <span>Senior (8+ years)</span>
                </div>
              </div>

              {/* Seniority Badge */}
              <div className="mt-4">
                <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                  selectedNurse.seniority_level === 'senior'
                    ? 'bg-green-100 text-green-800'
                    : selectedNurse.seniority_level === 'mid'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {selectedNurse.seniority_level.charAt(0).toUpperCase() + selectedNurse.seniority_level.slice(1)} Level Nurse
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-gray-400 text-6xl mb-4">👩‍⚕️</div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">Select a Nurse</h3>
              <p className="text-gray-500">
                Choose a nurse from the list to view their detailed information.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}