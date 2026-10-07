import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class names, with the last word winning.
 *
 * `clsx` for the conditionals and `tailwind-merge` for the conflicts: a caller
 * that passes `className="p-2"` to a card whose own class list says `p-6` means
 * the padding they wrote, not both at once with the stylesheet deciding which.
 * Every component here puts its own classes first for that reason.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
