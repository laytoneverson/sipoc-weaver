import { NextResponse } from "next/server";
import {
  readWorkspaceDocument,
  writeWorkspaceDocument,
} from "@/lib/server/workspaceRepo";
import { getSyncHub } from "@/lib/server/syncHub";
import type { PutWorkspaceBody } from "@/lib/syncTypes";
import { SCHEMA_VERSION, workspaceSchema } from "@/lib/types";
import { migrateWorkspaceHierarchy } from "@/lib/hierarchy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function migrateWorkspace(ws: PutWorkspaceBody["workspace"]) {
  return {
    ...migrateWorkspaceHierarchy(ws),
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const doc = await readWorkspaceDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      revision: doc.revision,
      updatedAt: doc.updatedAt,
      workspace: doc.workspace,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read";
    const status = message.includes("Invalid workspace id") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await req.json()) as PutWorkspaceBody;
    if (!body?.workspace || !body?.clientId) {
      return NextResponse.json(
        { error: "workspace and clientId are required" },
        { status: 400 },
      );
    }

    const migrated = migrateWorkspace(body.workspace);
    const parsed = workspaceSchema.safeParse(migrated);
    const workspace = (parsed.success ? parsed.data : migrated) as typeof migrated;

    const doc = await writeWorkspaceDocument(
      id,
      { ...workspace, id },
      body.baseRevision,
    );

    getSyncHub().broadcast(
      id,
      {
        type: "workspace:updated",
        workspaceId: id,
        revision: doc.revision,
        workspace: doc.workspace,
        clientId: body.clientId,
        updatedAt: doc.updatedAt,
      },
      body.clientId,
    );

    return NextResponse.json({
      revision: doc.revision,
      updatedAt: doc.updatedAt,
      workspace: doc.workspace,
    });
  } catch (e) {
    const err = e as Error & { status?: number; document?: unknown };
    if (err.status === 409 && err.document) {
      return NextResponse.json(
        { error: "Revision conflict", document: err.document },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to write";
    const status = message.includes("Invalid workspace id") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
