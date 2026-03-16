import React from "react";

interface ResponsiveTableProps {
  children: React.ReactNode;
}

export function ResponsiveTable({ children }: ResponsiveTableProps) {
  return (
    <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      {children}
    </div>
  );
}
