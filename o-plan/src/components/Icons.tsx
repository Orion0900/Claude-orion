/** Line icons on a 24px grid, drawn in the current text color. */
const Icon = ({ d, label }: { d: string; label?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={label ? undefined : true}
    role={label ? 'img' : undefined}
    aria-label={label}
  >
    <path d={d} />
  </svg>
)

export const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />
export const CloseIcon = () => <Icon d="M6 6l12 12M18 6L6 18" />
export const CheckIcon = () => <Icon d="M5 12.5l4.5 4.5L19 7.5" />
export const ChevronIcon = () => <Icon d="M9 6l6 6-6 6" />
export const UpIcon = () => <Icon d="M12 19V5M6 11l6-6 6 6" />
export const DownIcon = () => <Icon d="M12 5v14M6 13l6 6 6-6" />
export const TrashIcon = () => <Icon d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
export const FlagIcon = () => <Icon d="M6 21V4M6 4.5h11.5l-2.5 4 2.5 4H6" />
export const EditIcon = () => <Icon d="M4 20h4.5L19.5 9a2.1 2.1 0 00-3-3L5.5 17 4 20zM14.5 8l3 3" />
