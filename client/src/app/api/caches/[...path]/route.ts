import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";

import { NextResponse } from "next/server";

const CACHE_ROOT = path.join(process.cwd(), "caches");

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json; charset=utf-8";
    case ".dat":
    case ".idx":
      return "application/octet-stream";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } },
) {
  const requestedPath = params.path ?? [];
  const normalizedPath = path.normalize(path.join(...requestedPath));
  const fullPath = path.resolve(CACHE_ROOT, normalizedPath);

  // Prevent path traversal outside the caches directory (the separator stops "caches-other/...").
  const root = path.resolve(CACHE_ROOT);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Streamed rather than read whole per request; no-store because the browser's HTTP disk cache
    // fails writing the ~160 MB main_file_cache.dat2 (ERR_CACHE_WRITE_FAILURE aborts the fetch).
    const body = Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": getMimeType(fullPath),
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
