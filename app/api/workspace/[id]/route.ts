import { NextResponse } from "next/server";
import {
  readWorkspaceDocument,
  writeWorkspaceDocument,
} from "@/lib/server/workspaceRepo";
import { getSyncHub } from "@/lib/server/syncHub";
import { getSessionUser } from "@/lib/server/auth";
import { readOrganization } from "@/lib/server/orgRepo";
import {
  annotateWorkspaceConnections,
  filterWorkspaceForUser,
  validateWorkspaceWrite,
} from "@/lib/server/permissions";
import { ensureSeedData } from "@/lib/server/seed";
import type { PutWorkspaceBody } from "@/lib/syncTypes";
import { SCHEMA_VERSION, workspaceSchema } from "@/lib/types";
import { migrateWorkspaceSecurity } from "@/lib/securityMigration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function migrateWorkspace(ws: PutWorkspaceBody["workspace"]) {
  return {
    ...migrateWorkspaceSecurity(ws),
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await ensureSeedData();
    const user = await getSessionUser(req.headers.get("cookie"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await readOrganization();
    if (!org) {
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 500 },
      );
    }

    const doc = await readWorkspaceDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const migrated = migrateWorkspace(doc.workspace);
    const annotated = annotateWorkspaceConnections(migrated);
    const filtered = filterWorkspaceForUser(annotated, org, user.id);

    return NextResponse.json({
      revision: doc.revision,
      updatedAt: doc.updatedAt,
      workspace: filtered,
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
    await ensureSeedData();
    const user = await getSessionUser(req.headers.get("cookie"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await readOrganization();
    if (!org) {
      return NextResponse.json(
        { error: "Organization not configured" },
        { status: 500 },
      );
    }

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
    const annotated = annotateWorkspaceConnections(workspace);

    const authz = validateWorkspaceWrite(annotated, org, user);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: 403 });
    }

    const doc = await writeWorkspaceDocument(
      id,
      { ...annotated, id },
      body.baseRevision,
    );

    getSyncHub().broadcast(
      id,
      {
        type: "workspace:updated",
        workspaceId: id,
        revision: doc.revision,
        workspace: filterWorkspaceForUser(doc.workspace, org, user.id),
        clientId: body.clientId,
        updatedAt: doc.updatedAt,
      },
      body.clientId,
    );

    return NextResponse.json({
      revision: doc.revision,
      updatedAt: doc.updatedAt,
      workspace: filterWorkspaceForUser(doc.workspace, org, user.id),
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
