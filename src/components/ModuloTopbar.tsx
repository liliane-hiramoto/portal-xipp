"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ModuloTopbar({ titulo, userEmail }: { titulo: string; userEmail?: string }) {
  async function sair() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }
  return (
    <header className="brand-bg flex items-center justify-between px-6 py-3 text-slate-100">
      <div className="flex items-center gap-3">
        <Link href="/" className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20" title="Voltar ao Portal">◄ Portal</Link>
        <span className="text-sm font-semibold">{titulo}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        {userEmail && <span className="hidden text-slate-200 sm:inline">{userEmail}</span>}
        <button onClick={sair} className="rounded bg-white/10 px-2 py-1 hover:bg-white/20">Sair</button>
      </div>
    </header>
  );
}
