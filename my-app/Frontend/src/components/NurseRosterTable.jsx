import React from "react";

export default function NurseRosterDetails({ nurses }) {
  return (
    <div className="p-5 min-h-screen">
      {/* Match with NurseDetailsPage max-width */}
      <div className="bg-white border border-black overflow-hidden max-w-7xl mx-auto">

        {/* Data Rows */}
        {nurses.map((nurse, idx) => {
          const rowColor = idx % 2 === 0 ? "bg-[#EEFFED]" : "bg-[#FFF7DC]";
          return (
            <div
              key={nurse.id || idx}
              className={`grid grid-cols-3 border-b last:border-b-0 divide-x divide-black ${rowColor}`}
            >
              {/* Column 1 */}
              <div className="p-3 flex flex-col justify-between h-full">
                <div className="text-sm font-bold text-black-600">ID: {nurse.id}</div>

                {/* Centered Name */}
                <div className="flex flex-1 items-center justify-center">
                  <div className="mt-6 text-lg font-semibold text-black-900 text-center">
                    {nurse.name}
                  </div>
                </div>

                {nurse.preferences && (
                  <div className="text-[13px] text-black font-semibold italic mt-auto pt-8">
                    *Preferences: {nurse.preferences}
                  </div>
                )}
              </div>

              {/* Column 2 */}
              <div className="p-3 flex flex-col items-center">
                <div className="text-sm font-bold text-black-600 mb-2">Availability: </div>
                {nurse.availability?.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-black-700 text-left">
                    {nurse.availability.map((item, idx2) => (
                      <li key={idx2}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No availability</p>
                )}
              </div>

              {/* Column 3 */}
              <div className="p-3 flex flex-col items-center text-center">
                <div className="text-sm font-bold text-black-600">Unavailability: </div>
                {nurse.unavailability &&
                Object.keys(nurse.unavailability).length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-gray-700 inline-block text-left">
                    {Object.entries(nurse.unavailability).map(([day, shift]) => (
                      <li key={day}>
                        {day}: {shift}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-black-500 pt-2">No unavailability</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
