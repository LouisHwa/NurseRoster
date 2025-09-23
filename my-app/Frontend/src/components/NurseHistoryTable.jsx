"use client";

export default function NurseHistoryTable({ nurses }) {
  if (!nurses || nurses.length === 0) {
    return <p className="text-gray-500">No history data available</p>;
  }

  return (
    <div className="overflow-x-auto bg-white shadow rounded-lg">
      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Nurse ID</th>
            <th className="border p-2">Name</th>
            <th className="border p-2">Department</th>
            <th className="border p-2">Availability</th>
          </tr>
        </thead>
        <tbody>
          {nurses.map((nurse) => (
            <tr key={nurse.id}>
              <td className="border p-2">{nurse.id}</td>
              <td className="border p-2">{nurse.name}</td>
              <td className="border p-2">{nurse.department || "-"}</td>
              <td className="border p-2">
                {nurse.availability && nurse.availability.length > 0 ? (
                  <ul className="list-disc list-inside">
                    {nurse.availability.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
