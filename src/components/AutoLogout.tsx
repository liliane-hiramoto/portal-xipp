"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Logout automático após inatividade (segurança). Cobre todo o portal.
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos

export default function AutoLogout() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armado = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    async function sair() {
      if (!armado.current) return;
      armado.current = false;
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignora */
      }
      window.location.href = "/login?timeout=1";
    }

    function resetar() {
      if (!armado.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(sair, TIMEOUT_MS);
    }

    const eventos: (keyof DocumentEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    function ligar() {
      armado.current = true;
      eventos.forEach((e) => window.addEventListener(e, resetar, { passive: true }));
      document.addEventListener("visibilitychange", resetar);
      resetar();
    }

    // Só arma o timer se houver sessão (não faz nada na tela de login).
    supabase.auth.getUser().then(({ data }) => {
      if (ativo && data.user) ligar();
    });

    return () => {
      ativo = false;
      if (timer.current) clearTimeout(timer.current);
      eventos.forEach((e) => window.removeEventListener(e, resetar));
      document.removeEventListener("visibilitychange", resetar);
    };
  }, []);

  return null;
}
