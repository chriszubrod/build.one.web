import type { PollingState } from "../hooks/useCompletionPolling";

interface Props<T> {
  state: PollingState<T>;
  completeMessage: string;
  viewLabel: string;
  onView: () => void;
}

export default function CompletionStatusBar<T>({
  state,
  completeMessage,
  viewLabel,
  onView,
}: Props<T>) {
  if (state.status === "polling") {
    return (
      <div className="completion-status-bar completion-status-bar--info">
        Completing... (poll #{state.attempt})
      </div>
    );
  }
  if (state.status === "complete") {
    return (
      <div className="completion-status-bar completion-status-bar--success">
        {completeMessage}{" "}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onView}>
          {viewLabel}
        </button>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="completion-status-bar completion-status-bar--error">
        {state.message}
      </div>
    );
  }
  return null;
}
