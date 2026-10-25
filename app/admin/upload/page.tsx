"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { UploadDropzone } from "../../../components/upload-dropzone";

interface UploadResult {
  accepted: ReadonlyArray<{ filename: string }>;
  rejected: ReadonlyArray<{ filename: string; reason: string }>;
  ingested: { documents: number; chunks: number };
}

function readError(value: unknown): string {
  if (
    typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "object"
    && value.error !== null
    && "message" in value.error
    && typeof value.error.message === "string"
  ) {
    return value.error.message;
  }

  return "Upload failed. Try again.";
}

export default function AdminUploadPage() {
  const [token, setToken] = useState("");
  const [files, setFiles] = useState<Array<File>>([]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem("knowyu-ingest-token") ?? "");
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (token.length === 0 || files.length === 0) {
      return;
    }

    setPending(true);
    setError(null);
    setResult(null);
    sessionStorage.setItem("knowyu-ingest-token", token);
    const body = new FormData();
    files.forEach((file) => body.append("files", file));

    try {
      const response = await fetch("/api/v1/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(readError(payload));
      }

      if (
        typeof payload !== "object"
        || payload === null
        || !("data" in payload)
      ) {
        throw new Error("The server returned an invalid response.");
      }

      setResult(payload.data as UploadResult);
      setFiles([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="admin-upload" aria-labelledby="upload-heading">
      <div className="page-heading">
        <div>
          <h2 id="upload-heading">Upload corpus files</h2>
          <p>Files are stored privately. PDF and Markdown files up to 20 MB are accepted.</p>
        </div>
        <Link href="/">Back to chat</Link>
      </div>

      <form onSubmit={(event) => void upload(event)}>
        <label htmlFor="admin-token">Admin token</label>
        <input
          id="admin-token"
          type="password"
          autoComplete="off"
          value={token}
          disabled={pending}
          onChange={(event) => setToken(event.target.value)}
        />
        <UploadDropzone files={files} disabled={pending} onChange={setFiles} />
        <button
          className="button-primary"
          type="submit"
          disabled={pending || token.length === 0 || files.length === 0}
        >
          {pending ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
      </form>

      {error === null ? null : <p className="form-error" role="alert">{error}</p>}
      {result === null ? null : (
        <div className="upload-result" role="status">
          <h3>Upload complete</h3>
          <p>{result.accepted.length} accepted; {result.rejected.length} rejected.</p>
          <p>
            {result.ingested.documents} documents ingested into {result.ingested.chunks} chunks.
          </p>
          {result.rejected.length === 0 ? null : (
            <ul>
              {result.rejected.map((file) => (
                <li key={`${file.filename}-${file.reason}`}>
                  {file.filename}: {file.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

