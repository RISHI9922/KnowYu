"use client";

interface ErrorStateProps {
  message: string;
  requestId: string | null;
  onRetry: () => void;
}

export function ErrorState({
  message,
  requestId,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <p className="error-title">Something went wrong</p>
      <p>{message}</p>
      <button
        className="button-secondary"
        type="button"
        onClick={onRetry}
      >
        Try again
      </button>
      {requestId !== null ? (
        <p className="request-id">Request: {requestId}</p>
      ) : null}
    </div>
  );
}
