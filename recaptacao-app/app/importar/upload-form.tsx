"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

export default function UploadForm() {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [names, setNames] = useState<string[]>([]);

  function take(files: FileList | null) {
    if (files?.length && input.current) {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      input.current.files = dt.files;
      setNames([...files].map((f) => f.name));
    }
  }

  function clear(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (input.current) input.current.value = "";
    setNames([]);
  }

  return (
    <form action="/api/import" method="post" encType="multipart/form-data" className="stack">
      <div
        className={"dropzone" + (dragging ? " dragging" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
      >
        <input
          ref={input}
          type="file"
          name="file"
          accept=".xlsx"
          multiple
          required
          className="file-cover"
          onChange={(e) => setNames([...(e.target.files ?? [])].map((f) => f.name))}
        />
        {names.length ? (
          <>
            <strong>
              {names.length} arquivo{names.length > 1 ? "s" : ""}: {names.join(", ")}
            </strong>{" "}
            <button type="button" className="btn-danger-ghost btn-sm" onClick={clear}>
              Remover
            </button>
          </>
        ) : (
          <span>Clique ou arraste os xlsx para cá (um por polo, ou um combinado)</span>
        )}
      </div>
      <p>
        <Button type="submit" disabled={!names.length}>
          Importar
        </Button>
      </p>
    </form>
  );
}
