"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays, CircleHelp, Folder, Home, Inbox, LayoutTemplate, Plus, Settings2, UserRound } from "lucide-react";
import "@fontsource-variable/manrope";
import LiquidGlassExpandableSidebar, { type GlassNavItem, type GlassNavGroup } from "./liquid-glass-expandable-sidebar";

const settings = {
  frost: 2,
  edgeLight: 0.85,
  refraction: 20,
  selectionLight: 0.8,
  startExpanded: true,
};

const workspaceStyles = `
.gn-workspace {
  --gn-demo-bg: var(--color-background, Canvas);
  --gn-demo-card: var(--color-card, Canvas);
  --gn-demo-ink: var(--color-card-foreground, var(--color-foreground, CanvasText));
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: none;
  flex: 1 1 100%;
  min-block-size: 100svh;
  padding: 52px clamp(16px, 4vw, 56px);
  color: var(--gn-demo-ink);
  background: var(--gn-demo-bg);
  font-family: "Manrope Variable", Manrope, system-ui, sans-serif;
}
.gn-workspace[data-scene="sidebar"] {
  --gn-sidebar-inset: 56px;
  justify-items: start;
  padding-block: 14px 42px;
  padding-inline: clamp(24px, 10vw, 120px);
}
.gn-workspace[data-gn-mode="dark"] { color-scheme: dark; }
.gn-workspace[data-gn-mode="light"] { color-scheme: light; }

.gn-workspace-photo {
  position: absolute;
  z-index: -2;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: var(--gn-photo-position, center);
  visibility: hidden;
}
.gn-workspace-photo[data-ready="true"] { visibility: visible; }
.gn-workspace[data-scene="contour"] { --gn-photo-position: center 68%; }
.gn-workspace[data-scene="spotlight"] { --gn-photo-position: center 58%; }
.gn-workspace[data-scene="notched"] { --gn-photo-position: center 47%; }
.gn-workspace[data-scene="sidebar"] { --gn-photo-position: center 58%; }
.gn-workspace::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: color-mix(in srgb, var(--gn-demo-bg) 8%, transparent);
  pointer-events: none;
}
.gn-workspace[data-gn-mode="dark"]::before { background: color-mix(in srgb, var(--gn-demo-bg) 18%, transparent); }
.gn-workspace-navigation {
  inline-size: min(100%, 560px);
  min-inline-size: 0;
}
.gn-workspace[data-scene="sidebar"] .gn-workspace-navigation { inline-size: min(100%, 260px); }
@media (max-width: 540px) {
  .gn-workspace[data-scene="sidebar"] { justify-items: center; padding-inline: 16px; }
}

.gn-workspace-credit {
  position: absolute;
  inset-inline-end: 12px;
  inset-block-end: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-block-size: 28px;
  padding-inline: 9px;
  border-radius: 6px;
  color: var(--gn-demo-ink);
  background: color-mix(in srgb, var(--gn-demo-card) 84%, transparent);
  font-size: .6875rem;
  text-decoration: none;
}
.gn-workspace-credit:hover { text-decoration: underline; }
.gn-workspace-credit[href] { min-block-size: 44px; }
.gn-workspace-credit:focus-visible { outline: 2px solid var(--color-ring, Highlight); }
.gn-workspace-credit svg { width: 12px; height: 12px; }
`;

type NavigationDemoKind = "contour" | "spotlight" | "notched" | "sidebar";
type NavigationDemoBindings = {
  activeId: string;
  items: GlassNavItem[];
  groups: GlassNavGroup[];
  onNavigate: (item: GlassNavItem, event: MouseEvent<HTMLAnchorElement>) => void;
};

const workspaceItems: GlassNavItem[] = [
  { id: "home", href: "#home", label: "Home", icon: <Home /> },
  { id: "projects", href: "#projects", label: "Projects", icon: <Folder /> },
  { id: "create", href: "#create", label: "Create", icon: <Plus /> },
  { id: "inbox", href: "#inbox", label: "Inbox", icon: <Inbox />, badge: "2 unread messages" },
  { id: "profile", href: "#profile", label: "Profile", icon: <UserRound /> },
];

const workspaceGroups: GlassNavGroup[] = [
  {
    label: "Workspace",
    items: workspaceItems.slice(0, 4).map(item => item.id === "projects" ? {
      ...item,
      children: [
        { id: "studio", href: "#studio", label: "Studio website", icon: <LayoutTemplate /> },
        { id: "portal", href: "#portal", label: "Client portal", icon: <Folder /> },
      ],
    } : item),
  },
  {
    label: "More",
    items: [
      { id: "calendar", href: "#calendar", label: "Calendar", icon: <CalendarDays /> },
      { id: "settings", href: "#settings", label: "Settings", icon: <Settings2 /> },
      { id: "help", href: "#help", label: "Help", icon: <CircleHelp /> },
    ],
  },
];

const initialSelection: Record<NavigationDemoKind, string> = {
  contour: "projects", spotlight: "inbox", notched: "create", sidebar: "studio",
};
const dockIds = new Set(workspaceItems.map(item => item.id));
const sidebarIds = new Set([
  "profile",
  ...workspaceGroups.flatMap(group => group.items.flatMap(item => [
    item.id,
    ...(item.children ?? []).map(child => child.id),
  ])),
]);

// Verified reliable stock scenes
const scenes: Record<NavigationDemoKind, { image: string; author: string; source?: string }> = {
  contour: {
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
    author: "Milad Fakurian", source: "https://unsplash.com/photos/3epCdVoYCds",
  },
  spotlight: {
    image: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1200&q=80",
    author: "DeepMind",
  },
  notched: {
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
    author: "Automate Flows",
  },
  sidebar: {
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
    author: "Automate Flows",
  },
};

function workspaceRoute(kind: NavigationDemoKind) {
  if (typeof location === "undefined") return initialSelection[kind];
  const id = location.hash.slice(1);
  const available = kind === "sidebar" ? sidebarIds : dockIds;
  return available.has(id) ? id : initialSelection[kind];
}

function useWorkspaceTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const html = document.documentElement;
    const preferred = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (html.classList.contains("dark") || html.dataset.theme === "dark") setDark(true);
      else if (html.classList.contains("light") || html.dataset.theme === "light") setDark(false);
      else setDark(preferred.matches);
    };
    const changes = new MutationObserver(update);
    changes.observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] });
    preferred.addEventListener("change", update);
    update();
    return () => { changes.disconnect(); preferred.removeEventListener("change", update); };
  }, []);
  return dark;
}

function NavigationWorkspaceDemo({ kind, dark, renderNavigation }: {
  kind: NavigationDemoKind;
  dark: boolean;
  renderNavigation: (bindings: NavigationDemoBindings) => ReactNode;
}) {
  const [activeId, setActiveId] = useState(() => workspaceRoute(kind));
  const [loadedScene, setLoadedScene] = useState<string | null>(null);
  const scene = scenes[kind];

  useEffect(() => {
    const update = () => setActiveId(workspaceRoute(kind));
    addEventListener("hashchange", update);
    addEventListener("popstate", update);
    return () => { removeEventListener("hashchange", update); removeEventListener("popstate", update); };
  }, [kind]);

  const onNavigate = (item: GlassNavItem, event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (location.hash !== item.href) history.pushState(null, "", item.href);
    setActiveId(item.id);
  };

  return (
    <main className="gn-workspace" data-scene={kind} data-gn-mode={dark ? "dark" : "light"}>
      <style>{workspaceStyles}</style>
      <img className="gn-workspace-photo" src={scene.image} alt="" aria-hidden="true"
        fetchPriority="high" decoding="async" data-ready={loadedScene === scene.image}
        onLoad={async event => {
          const photo = event.currentTarget;
          try {
            await photo.decode();
          } catch {
            if (!photo.naturalWidth) return;
          }
          setLoadedScene(scene.image);
        }} />
      <div className="gn-workspace-navigation">
        {renderNavigation({ activeId, items: workspaceItems, groups: workspaceGroups, onNavigate })}
      </div>
      {scene.source ? (
        <a className="gn-workspace-credit" href={scene.source} target="_blank" rel="noreferrer">
          Photo by {scene.author} <ArrowUpRight aria-hidden="true" />
        </a>
      ) : <span className="gn-workspace-credit">Artwork by {scene.author}</span>}
    </main>
  );
}

export default function LiquidGlassExpandableSidebarDemo(props: Partial<typeof settings> = {}) {
  const s = { ...settings, ...props };
  const dark = useWorkspaceTheme();
  const glass = {
    blur: s.frost,
    edge: s.edgeLight,
    distortion: s.refraction,
  };
  return (
    <NavigationWorkspaceDemo kind="sidebar" dark={dark} renderNavigation={({ items, groups, activeId, onNavigate }) => (
      <LiquidGlassExpandableSidebar
        groups={groups}
        brand="Studio workspace"
        account={{ id: "profile", name: "Studio Member", detail: "Studio workspace", initials: "SM", href: "#profile" }}
        defaultExpanded={s.startExpanded}
        key={String(s.startExpanded)}
        selectionLight={s.selectionLight / 0.8}
        activeId={activeId}
        onNavigate={onNavigate}
        glass={glass}
      />
    )} />
  );
}
