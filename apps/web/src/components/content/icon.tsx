import {
  Activity,
  Archive,
  Blocks,
  Bot,
  Box,
  Boxes,
  Braces,
  Brain,
  Bug,
  Cloud,
  Code,
  Compass,
  Database,
  Eye,
  FileText,
  Filter,
  Fingerprint,
  Gauge,
  GitBranch,
  Globe,
  History,
  Image,
  Languages,
  Layers,
  LayoutGrid,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  Palette,
  Plug,
  Radio,
  RefreshCw,
  Repeat,
  Rocket,
  ScanText,
  Search,
  Server,
  Settings,
  Share,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  Timer,
  Type,
  Users,
  WandSparkles,
  Waypoints,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The icons a `feature` document may name.
 *
 * A named registry rather than `import { icons } from 'lucide-react'`, which is
 * the other way to do this and would put every icon in the library — a few
 * thousand of them, most never referenced by any document — into the bundle of a
 * marketing page. The trade is that a `feature.icon` outside this list draws the
 * fallback below rather than itself, which is a missing glyph in one card instead
 * of a megabyte on every visitor's first paint.
 *
 * Keys are matched loosely (`resolveIcon`), so `BarChart3`, `bar-chart-3` and
 * `bar chart 3` all find the same icon: an editor types what the studio's schema
 * field offers, and this should not be the place that argues about spelling.
 */
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  blocks: Blocks,
  bot: Bot,
  box: Box,
  boxes: Boxes,
  braces: Braces,
  brain: Brain,
  bug: Bug,
  cloud: Cloud,
  code: Code,
  compass: Compass,
  database: Database,
  eye: Eye,
  filetext: FileText,
  filter: Filter,
  fingerprint: Fingerprint,
  gauge: Gauge,
  gitbranch: GitBranch,
  globe: Globe,
  history: History,
  image: Image,
  languages: Languages,
  layers: Layers,
  layoutgrid: LayoutGrid,
  link: LinkIcon,
  lock: Lock,
  messagesquare: MessageSquare,
  palette: Palette,
  plug: Plug,
  radio: Radio,
  refreshcw: RefreshCw,
  repeat: Repeat,
  rocket: Rocket,
  scantext: ScanText,
  search: Search,
  server: Server,
  settings: Settings,
  share: Share,
  shieldcheck: ShieldCheck,
  sparkles: Sparkles,
  tag: Tag,
  terminal: Terminal,
  timer: Timer,
  type: Type,
  users: Users,
  wandsparkles: WandSparkles,
  waypoints: Waypoints,
  webhook: Webhook,
  workflow: Workflow,
  zap: Zap,
};

const FALLBACK: LucideIcon = Boxes;

export function resolveIcon(name?: string): LucideIcon {
  if (!name) return FALLBACK;
  return ICONS[normalise(name)] ?? FALLBACK;
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
