"use client";
// <SaidaPorInatividade>: encerra a sessão depois de um tempo parado. Vai UMA
// vez no layout raiz do portal — vale para toda tela, inclusive as que nascerem
// depois. As regras (quanto tempo em qual rota) estão em ./inatividade.
//
// No portal:
//   // src/app/layout.tsx
//   <SaidaPorInatividade regra={{ curto: 3, longo: 15, longas: ["/", "/intranet", "/timesheet"] }} />
//
// Sem sessão (login, links públicos como /coleta e /vaga) não faz nada.
// A conferência é por relógio, a cada 15 s, e não por um setTimeout longo: o
// notebook que dormiu acorda e sai na hora, em vez de esperar o cronômetro.
// Sai só DESTE navegador (`scope: "local"`): o celular e o outro computador
// seguem logados.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { CHAVE_ATIVIDADE, expirou, minutosDaRota, ultimaAtividade, type RegraInatividade } from "./inatividade";

const EVENTOS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;
const CONFERE_MS = 15_000;
const GRAVA_MS = 5_000;

const ler = () => { try { return localStorage.getItem(CHAVE_ATIVIDADE); } catch { return null; } };
const gravar = (t: number) => { try { localStorage.setItem(CHAVE_ATIVIDADE, String(t)); } catch {} };

export function SaidaPorInatividade({ regra }: { regra: RegraInatividade }) {
  const path = usePathname() ?? "/";
  const minutos = minutosDaRota(path, regra);
  const ultima = useRef(0); // o effect marca a chegada (mexeu) antes do primeiro relógio
  const gravadaEm = useRef(0);

  useEffect(() => {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    let saindo = false;

    const mexeu = () => {
      const agora = Date.now();
      ultima.current = agora;
      if (agora - gravadaEm.current >= GRAVA_MS) { gravadaEm.current = agora; gravar(agora); }
    };
    const conferir = async () => {
      if (saindo) return;
      const agora = Date.now();
      if (!expirou(ultimaAtividade(ultima.current, ler()), agora, minutos)) return;
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      saindo = true;
      await sb.auth.signOut({ scope: "local" });
      window.location.assign("/login?expirado=1");
    };
    const voltou = () => { if (document.visibilityState === "visible") void conferir(); };

    mexeu();
    EVENTOS.forEach((e) => window.addEventListener(e, mexeu, { passive: true }));
    document.addEventListener("visibilitychange", voltou);
    const relogio = setInterval(conferir, CONFERE_MS);
    return () => {
      clearInterval(relogio);
      EVENTOS.forEach((e) => window.removeEventListener(e, mexeu));
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [minutos]);

  return null;
}
