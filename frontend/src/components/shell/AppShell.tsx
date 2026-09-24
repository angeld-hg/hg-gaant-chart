// The 1280x800-first frame: sidebar (brand + projects), toolbar, and the open project (AC37).
import { type ReactNode, useState } from "react";
import { SIDEBAR_WIDTH } from "../../layout.ts";
import { useAppState } from "../../state/store.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ErrorToast } from "./ErrorToast.tsx";
import { type ProjectEditing, ProjectList } from "./ProjectList.tsx";
import { ProjectView } from "./ProjectView.tsx";
import { Toolbar } from "./Toolbar.tsx";

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="12" height="4" rx="2" fill="#818cf8" />
      <rect x="7" y="10" width="11" height="4" rx="2" fill="#34d399" />
      <rect x="10" y="16" width="12" height="4" rx="2" fill="#fbbf24" />
    </svg>
  );
}

function EmptyProjects(props: { onCreate: () => void }) {
  return (
    <div data-testid="empty-projects" className="empty-state">
      <svg className="empty-illustration" viewBox="0 0 160 96" aria-hidden="true">
        <rect x="0.5" y="0.5" width="159" height="95" rx="11.5" className="empty-frame" />
        <path d="M40 12v72M72 12v72M104 12v72M136 12v72" className="empty-grid" />
        <rect x="16" y="20" width="52" height="12" rx="6" fill="#818cf8" />
        <rect x="52" y="42" width="44" height="12" rx="6" fill="#34d399" />
        <rect x="84" y="64" width="56" height="12" rx="6" fill="#fbbf24" />
        <path d="M68 26h-2a6 6 0 00-6 6v10" className="empty-link" />
        <path d="M96 48h-2a6 6 0 00-6 6v10" className="empty-link" />
      </svg>
      <h2 className="empty-title">No projects yet</h2>
      <p className="empty-text">
        Create a project to start planning tasks, dependencies and milestones on a timeline.
      </p>
      <button type="button" className="button button-primary" onClick={props.onCreate}>
        Create a project
      </button>
    </div>
  );
}

function NoProjectOpen() {
  return (
    <div className="empty-state empty-state-quiet">
      <h2 className="empty-title">Pick a project</h2>
      <p className="empty-text">Choose a project from the sidebar to see its timeline.</p>
    </div>
  );
}

export function AppShell() {
  const { projects, current, projectsLoaded } = useAppState();
  const [editing, setEditing] = useState<ProjectEditing>(null);

  let content: ReactNode = null;
  if (current) {
    content = <ProjectView key={current.id} project={current} />;
  } else if (projectsLoaded && projects.length === 0) {
    content = <EmptyProjects onCreate={() => setEditing({ mode: "create" })} />;
  } else if (projectsLoaded) {
    content = <NoProjectOpen />;
  }

  return (
    <div className="app" style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px minmax(0, 1fr)` }}>
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <h1 className="brand-name">Gantt</h1>
          <span className="brand-tag">Planner</span>
        </div>
        <ProjectList editing={editing} onEditingChange={setEditing} />
        <p className="sidebar-footer">Changes save automatically</p>
      </aside>
      <div className="workspace">
        <Toolbar />
        <main className="workspace-body">{content}</main>
      </div>
      <ConfirmDialog />
      <ErrorToast />
    </div>
  );
}
