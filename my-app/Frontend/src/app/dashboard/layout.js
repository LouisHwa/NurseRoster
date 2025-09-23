export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-blue-100 p-6">
        <h2 className="text-lg font-bold mb-8">Nexus Dashboard</h2>
        <nav className="space-y-4">
          <a href="/dashboard" className="block text-gray-800 hover:font-semibold">
            📊 Overview
          </a>
          <a href="/dashboard/roster-generator" className="block text-gray-800 hover:font-semibold">
            ✏️ Create Timetable
          </a>
          <a href="/dashboard/nurse-details" className="block text-gray-800 hover:font-semibold">
            🧑‍⚕️ Nurse Details
          </a>
          <a href="/dashboard/history" className="block text-gray-800 hover:font-semibold">
            ⏳ History
          </a>
          <a href="/dashboard/help" className="block text-gray-800 hover:font-semibold">
            ⚙️ AI Chat Assistant
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
