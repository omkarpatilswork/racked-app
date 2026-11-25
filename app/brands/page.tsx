import { redirect } from "next/navigation";

// Short link for brands: the landing page's "For brands" section.
export default function BrandsPage() {
  redirect("/landing#brands");
}
