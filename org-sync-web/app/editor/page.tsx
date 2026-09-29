import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import EditorShell from "./EditorShell";

export default async function EditorPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 text-sm">
        <span className="font-medium">org-sync</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
            Sign out
          </button>
        </form>
      </header>
      <EditorShell token={session.accessToken} />
    </div>
  );
}
