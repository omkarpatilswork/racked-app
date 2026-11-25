import { redirect } from "next/navigation";

// Short link for gym owners: the landing page's "How it grows / For gyms" section.
export default function GymsPage() {
  redirect("/landing#gyms");
}
