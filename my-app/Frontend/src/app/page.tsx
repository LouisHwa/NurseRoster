"use client";

export default function Home() {
  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <button
          onClick={() =>
            (window.location.href = "http://localhost:3000/dashboard")
          }
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg cursor-pointer transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
        >
          Click to direct to our Dashboard
        </button>
      </div>
    </>
  );
}