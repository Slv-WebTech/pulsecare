/*
  Hand-rolled stroke icon set (24x24, round joins, currentColor) so the app
  doesn't pull in an icon package for ~30 glyphs. Style matches Lucide's
  conventions for visual consistency with anything added later.
*/
function Icon({ children, size = 18, className = "", ...rest }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PulseIcon = (p) => (
  <Icon {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Icon>
);

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

export const MapPinIcon = (p) => (
  <Icon {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);

export const DollarIcon = (p) => (
  <Icon {...p}>
    <path d="M12 2v20M17 5.5c0-1.9-2.2-3.5-5-3.5s-5 1.4-5 3.5S9.2 9 12 9s5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 3.2" />
  </Icon>
);

export const GlobeIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
  </Icon>
);

export const CalendarIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
    <path d="M8 3v3M16 3v3M3.5 9.5h17" />
  </Icon>
);

export const UserIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.5c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4" />
  </Icon>
);

export const UsersIcon = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.7 19.5c1.4-3.2 3.7-4.8 6.3-4.8s4.9 1.6 6.3 4.8" />
    <path d="M16 4.3a3.2 3.2 0 0 1 0 6.2M18.3 14.9c1.9.7 3.3 2.2 4.2 4.6" />
  </Icon>
);

export const MailIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </Icon>
);

export const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
  </Icon>
);

export const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (p) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.2A9.4 9.4 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3.4 4.2M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7a9.4 9.4 0 0 0 3.4-.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);

export const ChevronDownIcon = (p) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const XIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="m5 13 4 4L19 7" />
  </Icon>
);

export const CheckCircleIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.3 2.5 2.5 4.8-5.6" />
  </Icon>
);

export const AlertTriangleIcon = (p) => (
  <Icon {...p}>
    <path d="M10.6 3.9 2.4 18a1.8 1.8 0 0 0 1.5 2.7h16.2a1.8 1.8 0 0 0 1.5-2.7L13.4 3.9a1.8 1.8 0 0 0-2.8 0Z" />
    <path d="M12 9.5v4.2" />
    <path d="M12 17h.01" />
  </Icon>
);

export const AlertCircleIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </Icon>
);

export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6h.01" />
  </Icon>
);

export const UploadCloudIcon = (p) => (
  <Icon {...p}>
    <path d="M7 17.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18.3 9.4 4 4 0 0 1 17.5 17.5H15" />
    <path d="M12 21v-8M9 15.5 12 12.5 15 15.5" />
  </Icon>
);

export const FileTextIcon = (p) => (
  <Icon {...p}>
    <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V5A1.5 1.5 0 0 1 6 3.5Z" />
    <path d="M14 3.5V8h4M8.5 12.5h7M8.5 15.8h7M8.5 9.3h3" />
  </Icon>
);

export const SendIcon = (p) => (
  <Icon {...p}>
    <path d="M21 3 3 10.5l7.6 3M21 3l-6.5 18-4-7.5M21 3 10.6 13.5" />
  </Icon>
);

export const MessageIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 6.9 0 1 1 3.4 5.5L3.5 19l1.2-3.6A6.9 6.9 0 0 1 3.5 12Z" />
  </Icon>
);

export const SparklesIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v3.5M12 17.5V21M4.5 12H8M16 12h3.5M6.3 6.3l2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2" />
    <circle cx="12" cy="12" r="2.4" />
  </Icon>
);

export const LogOutIcon = (p) => (
  <Icon {...p}>
    <path d="M9 3.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h3" />
    <path d="M15.5 16.5 21 11l-5.5-5.5M21 11H9" />
  </Icon>
);

export const MenuIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
  </Icon>
);

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const TrendingUpIcon = (p) => (
  <Icon {...p}>
    <path d="m3 16.5 6-6.5 4 4L21 5.5" />
    <path d="M15 5.5h6V11.5" />
  </Icon>
);

export const InboxIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 12h5l1.6 3h3.8l1.6-3h5" />
    <path d="M5.4 6.4 3.5 12v6A1.5 1.5 0 0 0 5 19.5h14A1.5 1.5 0 0 0 20.5 18v-6l-1.9-5.6a1.5 1.5 0 0 0-1.4-1H6.8a1.5 1.5 0 0 0-1.4 1Z" />
  </Icon>
);

export const StethoscopeIcon = (p) => (
  <Icon {...p}>
    <path d="M6 3.5v6a4.5 4.5 0 0 0 9 0v-6" />
    <path d="M6 3.5H4.5M15 3.5h1.5" />
    <path d="M15 9.5v3a6 6 0 0 1-12 0v-2" />
    <circle cx="19" cy="15.5" r="2.2" />
    <path d="M19 13.3v-3.8" />
  </Icon>
);

export const CopyIcon = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
    <path d="M5.5 14.5h-1A1.5 1.5 0 0 1 3 13V4.5A1.5 1.5 0 0 1 4.5 3H13a1.5 1.5 0 0 1 1.5 1.5v1" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M18.5 7l-.8 12a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 7" />
  </Icon>
);

export const SlashIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M6.5 17.5l11-11" />
  </Icon>
);

export const BellIcon = (p) => (
  <Icon {...p}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 1.5 5.8 1.5 5.8H4.5S6 14 6 9.5Z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Icon>
);
