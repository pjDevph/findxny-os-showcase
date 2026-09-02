import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache";
import { parseHomeContent, type HomeContent } from "@/lib/home-content";
import { HomeEditor } from "@/features/admin/home/HomeEditor";

async function saveHomeContent(content: HomeContent) {
  "use server";
  const wsId = await resolveWorkspaceId();
  if (!wsId) return;
  await adminApi.workspacesUpdate({ workspace_id: wsId, home_content: content });
  revalidatePath("/home-editor");
  revalidatePath("/", "layout");
}

export const dynamic = "force-dynamic";

export default async function HomeEditorPage() {
  const wsId = await resolveWorkspaceId();
  const ctx = wsId ? await adminApi.context(wsId) : { workspace: null as any };
  const content = parseHomeContent(ctx.workspace?.home_content);

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Home Editor</h1>
          <div className="sub">Edit the homepage hero and the promos / events band — with live preview</div>
        </div>
      </div>
      <div className="admin-body">
        <HomeEditor initial={content} saveAction={saveHomeContent} />
      </div>
    </>
  );
}
