import { COPY } from "../copy.js";

export function LoadingPanel() {
  return (
    <div className="loading-panel" role="status">
      {COPY.state_loading.label}
    </div>
  );
}
