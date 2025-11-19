// components/CollapsibleSection.jsx
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

export default function CollapsibleSection({ title, color ="yellow", children }) {
  const [open, setOpen] = useState(false);

  const borderColor = {
    yellow: "border-yellow-400 bg-yellow-50",
    blue: "border-blue-400 bg-blue-50",
    green: "border-green-400 bg-green-50",
    red: "border-red-400 bg-red-50",
  }[color] || "border-gray-400 bg-gray-50";

  return (
    <div className="bg-white rounded-lg shadow-sm mb-6">
      
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className={`border-l-4 px-6 py-4 w-full flex items-center justify-between ${borderColor}`}
      >
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {title}
        </h2>

        {open ? (
          <ChevronDownIcon className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronRightIcon className="w-5 h-5 text-gray-600" />
        )}
      </button>

      {/* Collapsible content */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          open ? "max-h-[3000px]" : "max-h-0"
        }`}
      >
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
