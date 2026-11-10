"use client";

import { ProjectDetailsSettings } from "./ProjectDetailsSettings";
import { ProjectSection } from "./ProjectSection";

export function ProjectSettings({ projectId }: { projectId: string }) {
  return (
    <ProjectSection projectId={projectId}>
      {(project, { onProjectChange }) => (
        <div className="studio-page studio-settings">
          <header className="studio-page-heading">
            <div>
              <span className="studio-eyebrow">YOUR PROJECT</span>
              <h1>Project settings.</h1>
              <p>Manage this project’s details and archive status.</p>
            </div>
          </header>
          <div className="studio-settings-layout">
            <div className="studio-settings-main">
              <ProjectDetailsSettings project={project} onProjectChange={onProjectChange} />
            </div>
          </div>
        </div>
      )}
    </ProjectSection>
  );
}
