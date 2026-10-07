/**
 * The names a schema uses, turned into the shapes the studio draws.
 *
 * `SchemaType.icon` is a lucide name, which is a string in the data and a
 * component in the app. The map is explicit rather than a dynamic lookup over
 * the whole icon package: importing every icon to resolve one name ships a
 * megabyte of paths nobody drew, and a schema naming an icon this file has
 * never heard of deserves the plain document it falls back to rather than a
 * build that fails.
 */

import {
  BookIcon,
  BoxIcon,
  BuildingIcon,
  CalendarIcon,
  CircleHelpIcon,
  CodeIcon,
  CreditCardIcon,
  FileTextIcon,
  FilmIcon,
  FolderIcon,
  GlobeIcon,
  HashIcon,
  ImageIcon,
  LayersIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  type LucideIcon,
  MessageSquareIcon,
  NewspaperIcon,
  PackageIcon,
  PlugIcon,
  PuzzleIcon,
  QuoteIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  TagIcon,
  TypeIcon,
  VideoIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  book: BookIcon,
  box: BoxIcon,
  building: BuildingIcon,
  building2: BuildingIcon,
  calendar: CalendarIcon,
  code: CodeIcon,
  'credit-card': CreditCardIcon,
  'circle-help': CircleHelpIcon,
  'help-circle': CircleHelpIcon,
  file: FileTextIcon,
  'file-text': FileTextIcon,
  folder: FolderIcon,
  globe: GlobeIcon,
  hash: HashIcon,
  image: ImageIcon,
  layers: LayersIcon,
  layout: LayoutGridIcon,
  'layout-grid': LayoutGridIcon,
  link: LinkIcon,
  list: ListIcon,
  'message-square': MessageSquareIcon,
  newspaper: NewspaperIcon,
  package: PackageIcon,
  plug: PlugIcon,
  puzzle: PuzzleIcon,
  quote: QuoteIcon,
  settings: SettingsIcon,
  sparkles: SparklesIcon,
  star: StarIcon,
  tag: TagIcon,
  type: TypeIcon,
  user: UserIcon,
  users: UsersIcon,
  video: VideoIcon,
  film: FilmIcon,
  zap: ZapIcon,
};

/**
 * `CircleHelp`, `circle_help` and `circle-help` are one name to whoever wrote
 * the schema — as are `Building2` and `building-2`.
 */
function normalize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-(\d+)$/, '$1');
}

/**
 * Every name this map knows, for the icon picker.
 *
 * The picker offers what the studio can actually draw, rather than a text field
 * somebody types a name into: the map is the contract, and an icon outside it
 * falls back to a plain document — which is a fine answer for a schema written by
 * hand and a bad one for a form that asked you to choose.
 */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS).sort();

export function iconFor(name: string | undefined | null): LucideIcon {
  if (!name) return FileTextIcon;
  return ICONS[normalize(name)] ?? FileTextIcon;
}
