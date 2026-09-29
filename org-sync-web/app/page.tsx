import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/editor");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100">
      <div className="text-center space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">org-sync</h1>
        <p className="text-gray-400">Edit your org files. Sync to GitHub.</p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/editor" });
          }}
        >
          <button
            type="submit"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-md text-sm font-medium transition-colors"
          >
            Sign in with GitHub
          </button>
        </form>
      </div>
    </main>
  );
}
