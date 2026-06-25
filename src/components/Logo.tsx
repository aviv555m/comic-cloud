import React from 'react';

export const Logo = ({ className = "", size = 24 }: { className?: string; size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Cloud background fill for depth */}
      <path
        d="M23.4 28H10.6C5.85025 28 2 24.1497 2 19.4C2 15.0782 5.26359 11.5173 9.46487 11.0827C10.4286 8.12745 13.2044 6 16.5 6C20.6421 6 24 9.35786 24 13.5C27.9942 13.2847 31 16.4807 31 20.4C31 24.5974 27.5974 28 23.4 28Z"
        fill="currentColor"
        className="text-white/20"
      />
      {/* Open Book Outline inside the cloud */}
      <path
        d="M8 21.5C8 20 9.5 19 11 19C12.5 19 14 20 15 21C16 20 17.5 19 19 19C20.5 19 22 20 22 21.5M8 21.5V13.5C8 12 9.5 11 11 11C12.5 11 14 12 15 13C16 12 17.5 11 19 11C20.5 11 22 12 22 13.5V21.5M15 13V21.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Main Cloud Outline */}
      <path
        d="M23.4 28H10.6C5.85025 28 2 24.1497 2 19.4C2 15.0782 5.26359 11.5173 9.46487 11.0827C10.4286 8.12745 13.2044 6 16.5 6C20.6421 6 24 9.35786 24 13.5C27.9942 13.2847 31 16.4807 31 20.4C31 24.5974 27.5974 28 23.4 28Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
