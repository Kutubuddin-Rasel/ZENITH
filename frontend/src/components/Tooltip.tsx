import React, { ReactNode, useState } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ label, children }) => {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      {show && (
        <span className="absolute z-50 left-1/2 -translate-x-1/2 mt-2 px-3 py-1 rounded-lg bg-neutral-900 text-white text-xs font-medium shadow-lg whitespace-nowrap pointer-events-none animate-fade-in">
          {label}
        </span>
      )}
    </span>
  );
};

export default Tooltip; 