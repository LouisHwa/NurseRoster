"use client";

import { useState } from 'react';

export default function RosterGenerator() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [parameters, setParameters] = useState({
    week: '',
    departments: '',
    constraints: ''
  });

  const generateRoster = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Prepare the request body (adjust based on what your Lambda expects)
      const requestBody = {
        week: parameters.week || `${new Date().getFullYear()}-W${String(Math.ceil(new Date().getDate() / 7)).padStart(2, '0')}`,
        departments: parameters.departments ? parameters.departments.split(',').map(d => d.trim()) : [],
        constraints: parameters.constraints ? JSON.parse(parameters.constraints) : {}
      };

      const response = await fetch('https://as1xg7ssk9.execute-api.us-east-1.amazonaws.com/prod/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add any required headers like Authorization if needed
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      setResult(data);
      
    } catch (err) {
      console.error('Error generating roster:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Alternative: Simple GET request if your Lambda doesn't need parameters
  const generateRosterSimple = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('https://as1xg7ssk9.execute-api.us-east-1.amazonaws.com/prod/generate', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
      
    } catch (err) {
      console.error('Error generating roster:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6">Generate New Roster</h2>
        
        {/* Input Parameters (optional - adjust based on your Lambda requirements) */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Week (e.g., 2024-W01)
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="2024-W01"
              value={parameters.week}
              onChange={(e) => setParameters({...parameters, week: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Departments (comma-separated)
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Emergency, ICU, Surgery"
              value={parameters.departments}
              onChange={(e) => setParameters({...parameters, departments: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Constraints (JSON format)
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='{"minStaff": 3, "maxConsecutiveDays": 5}'
              rows="3"
              value={parameters.constraints}
              onChange={(e) => setParameters({...parameters, constraints: e.target.value})}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={generateRoster}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Roster (with parameters)'}
          </button>

          <button
            onClick={generateRosterSimple}
            disabled={loading}
            className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Roster (simple)'}
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Generating roster... This may take a moment.</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <h3 className="text-red-800 font-semibold">Error</h3>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* Success State */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <h3 className="text-green-800 font-semibold mb-2">Roster Generated Successfully!</h3>
            
            {/* Display basic info */}
            {result.week && (
              <p className="text-green-700 mb-2">
                <strong>Week:</strong> {result.week}
              </p>
            )}
            
            {result.departments && (
              <p className="text-green-700 mb-4">
                <strong>Departments:</strong> {result.departments.length}
              </p>
            )}

            {/* Show raw response for debugging */}
            <details className="mt-4">
              <summary className="cursor-pointer text-green-800 font-medium">
                View Raw Response
              </summary>
              <pre className="mt-2 bg-white p-3 rounded border text-xs overflow-auto max-h-60">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>

            {/* Action buttons for generated roster */}
            <div className="mt-4 flex gap-2">
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Refresh Page to See New Roster
              </button>
              
              <button 
                onClick={() => setResult(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Clear Result
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}