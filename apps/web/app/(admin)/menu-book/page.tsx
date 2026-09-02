import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { MenuBookMapper, type SavedMenuBook } from "@/features/admin/menu-book/MenuBookMapper";
import { revalidatePath } from "next/cache";

export const metadata = { title: "Menu Book · Admin" };

async function saveMenuBook(
  workspaceId: string,
  payload: {
    pages: { page_no: number; label: string; file_name?: string | null; image_path?: string | null }[];
    hotspots: {
      page_no: number;
      shape: "rect" | "square" | "ellipse" | "circle" | "freehand";
      x: number; y: number; w: number; h: number;
      points?: { x: number; y: number }[] | null;
      blend_color?: string | null;
      name: string;
      price: number;
      cat?: string | null;
      product_id?: string | null;
    }[];
  },
) {
  "use server";
  await adminApi.menuBookUpsert({ workspace_id: workspaceId, ...payload });
  revalidatePath("/menu-book");
  revalidatePath("/menu");
}

export const dynamic = "force-dynamic";

export default async function MenuBookPage() {
  const wsId = await resolveWorkspaceId();

  const [{ products }, { categories: _cats }, menuBook] = wsId
    ? await Promise.all([
        adminApi.products(wsId),
        adminApi.productCategories(wsId),
        adminApi.menuBook(wsId),
      ])
    : [{ products: [] as any[] }, { categories: [] as any[] }, { pages: [], hotspots: [] } as Awaited<ReturnType<typeof adminApi.menuBook>>];

  // Include ALL products (active + inactive) so the mapper can:
  //   • purge hotspots for truly deleted products
  //   • mark inactive-product hotspots as "Unavailable" without removing them
  const productList = products
    .filter((p: any) => p.for_sale !== false)
    .map((p: any) => ({
      id:     p.id as string,
      name:   p.name as string,
      price:  Number(p.price ?? 0),
      cat:    (p.product_categories?.name ?? "Uncategorised") as string,
      active: p.active !== false,
    }));

  const saved: SavedMenuBook = {
    pages: menuBook.pages.map((p) => ({
      page_no:    p.page_no,
      label:      p.label,
      file_name:  p.file_name,
      image_path: p.image_path,
      image_url:  p.image_url,
    })),
    hotspots: menuBook.hotspots.map((h) => ({
      page_no:     h.page_no,
      shape:       h.shape,
      x:           Number(h.x), y: Number(h.y), w: Number(h.w), h: Number(h.h),
      points:      h.points,
      blend_color: h.blend_color,
      name:        h.name,
      price:       Number(h.price),
      cat:         h.cat,
      product_id:  h.product_id,
    })),
  };

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Menu Book</h1>
          <div className="sub">
            Upload page images · draw hotspot areas · link to products
          </div>
        </div>
      </div>

      {/* full-height body — mapper handles its own internal scroll */}
      <div className="admin-body" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1 }}>
        <MenuBookMapper
          products={productList}
          workspaceId={wsId ?? ""}
          initial={saved}
          saveAction={saveMenuBook.bind(null, wsId ?? "")}
        />
      </div>
    </>
  );
}
