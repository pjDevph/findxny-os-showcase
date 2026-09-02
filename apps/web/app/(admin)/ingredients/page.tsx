import { redirect } from "next/navigation";

// Ingredients now live in the unified Inventory catalog.
export const dynamic = "force-dynamic";

export default function IngredientsPage() {
  redirect("/inventory");
}
