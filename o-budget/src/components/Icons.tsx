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
export const AlertIcon = () => <Icon d="M12 3.5L2.5 20h19L12 3.5zM12 10v4.5M12 17.2v.3" />
export const OkIcon = () => <Icon d="M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.3l2.8 2.8L16.2 9.6" />
export const ResetIcon = () => <Icon d="M4 12a8 8 0 108-8 8.6 8.6 0 00-6 2.5L4 8.5M4 4v4.5h4.5" />
