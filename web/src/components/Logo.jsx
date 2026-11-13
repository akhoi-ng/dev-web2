export default function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="flex-none">
      <circle cx="22" cy="22" r="22" fill="#B8321C"></circle>
      <path d="M10 23h24a12 12 0 0 1-24 0z" fill="#FFF8F2"></path>
      <path
        d="M17 19c-2-3 1-5 0-8M22 19c-2-3 1-5 0-8M27 19c-2-3 1-5 0-8"
        stroke="#F4B13E"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      ></path>
    </svg>
  );
}
