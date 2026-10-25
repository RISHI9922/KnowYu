"use client";

import { ChangeEvent, DragEvent, useRef } from "react";

interface UploadDropzoneProps {
  files: ReadonlyArray<File>;
  disabled: boolean;
  onChange: (files: Array<File>) => void;
}

const ACCEPT = ".pdf,.md,.markdown";

export function UploadDropzone({
  files,
  disabled,
  onChange,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | null): void {
    if (incoming === null) {
      return;
    }

    onChange([...files, ...Array.from(incoming)].slice(0, 20));
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>): void {
    addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();

    if (!disabled) {
      addFiles(event.dataTransfer.files);
    }
  }

  return (
    <div className="upload-picker">
      <div
        className="upload-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop PDF or Markdown files here</p>
        <button
          className="button-secondary"
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled}
          onChange={handleInput}
        />
      </div>

      {files.length === 0 ? null : (
        <ul className="upload-file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              <span>{file.name} ({Math.ceil(file.size / 1_024)} KB)</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, item) => item !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

