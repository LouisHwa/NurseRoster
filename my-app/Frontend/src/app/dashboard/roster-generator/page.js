"use client";

import { useState } from 'react';

function SimpleRosterGenerator() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Your API Gateway endpoint
  const API_ENDPOINT = 'https://as1xg7ssk9.execute-api.us-east-1.amazonaws.com/prod/generate';

  const generateRoster = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // Let the algorithm decide everything
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('API Response:', data);
      setResult(data);
      
    } catch (err) {
      console.error('Error generating roster:', err);
      if (err.message === 'Failed to fetch') {
        setError('Network error - unable to connect to roster generation service.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Staff Roster Generator</h1>
            <p className="text-gray-600">
              Generate optimal staff schedules automatically using AI-powered algorithms
            </p>
          </div>

          {/* Main Generate Button */}
          {!loading && !result && !error && (
            <div className="text-center mb-6">
              <button
                onClick={generateRoster}
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Roster
              </button>
              <p className="text-sm text-gray-500 mt-3">
                Click to automatically generate an optimized staff roster
              </p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="relative">
                {/* Main spinning loader */}
                <div className="inline-flex items-center justify-center w-20 h-20 mb-6">
                  <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-100">
                    <div className="border-4 border-blue-600 rounded-full h-full w-full border-t-transparent animate-spin"></div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Generating Roster</h3>
                <p className="text-gray-600 mb-6">
                  Algorithm is analyzing staff patterns and creating optimal schedules...
                </p>
                
                {/* Progress indicators */}
                <div className="max-w-md mx-auto mb-4">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{width: '70%'}}></div>
                  </div>
                </div>
                
                {/* Animated dots */}
                <div className="flex justify-center space-x-1">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                
                <p className="text-sm text-gray-500 mt-4">
                  This may take 30-60 seconds depending on complexity
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-semibold text-red-800 mb-1">Generation Failed</h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <div className="flex space-x-3">
                    <button 
                      onClick={generateRoster}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      Try Again
                    </button>
                    <button 
                      onClick={() => setError(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Success State */}
          {result && (
            <div className="text-center py-8">
              {/* Success Animation */}
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6 animate-pulse">
                <svg className="w-10 h-10 text-green-600 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-2xl font-bold text-green-800 mb-3">
                Roster Generated Successfully!
              </h3>
              <p className="text-green-700 mb-6 text-lg">
                Your optimized staff schedule is ready
              </p>
              
              {/* Success Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto mb-6">
                {result.rosterDate && (
                  <div className="bg-white border-2 border-green-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-sm font-medium text-green-800 mb-1">Week Starting</div>
                    <div className="text-gray-900 font-semibold">
                      {new Date(result.rosterDate).toLocaleDateString('en-US', { 
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                )}
                
                {result.totalStaff && (
                  <div className="bg-white border-2 border-green-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-sm font-medium text-green-800 mb-1">Staff Scheduled</div>
                    <div className="text-gray-900 font-semibold">{result.totalStaff} people</div>
                  </div>
                )}
              </div>

              {/* Success Message with Confetti Effect */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-center mb-3">
                  <span className="text-2xl mr-2">🎉</span>
                  <span className="text-lg font-semibold text-green-800">Perfect Schedule Created!</span>
                  <span className="text-2xl ml-2">🎉</span>
                </div>
                <p className="text-green-700">
                  The algorithm has analyzed all constraints and generated an optimal roster that balances staff preferences with operational needs.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button 
                  onClick={() => window.location.href = '/dashboard'}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-200 font-semibold shadow-lg"
                >
                  View Dashboard
                </button>
                
                <button 
                  onClick={generateRoster}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transform hover:scale-105 transition-all duration-200 font-semibold shadow-lg"
                >
                  Generate Another
                </button>
              </div>

              {/* Optional Details */}
              <div className="mt-6">
                <details className="text-left max-w-md mx-auto">
                  <summary className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors cursor-pointer text-sm font-medium text-center">
                    View Technical Details
                  </summary>
                  <div className="mt-3 bg-gray-50 border rounded-lg p-3">
                    <pre className="text-xs overflow-auto max-h-32 text-gray-700">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              The algorithm automatically optimizes for staff availability, workload balance, and scheduling constraints
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleRosterGenerator;