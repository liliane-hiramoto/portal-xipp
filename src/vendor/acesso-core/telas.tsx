"use client";
// As telas de acesso: entrar (com "Esqueci minha senha") e trocar a senha.
//
// A MESMA tela nos cinco portais; muda só a marca (`Marca`). O estilo é inline
// de propósito: no RQ o Tailwind só carrega em parte do app, e na Headset o
// CSS artesanal do Portal pega `input`/`label` soltos — classe de fora não
// chega igual em todo lugar, `style` chega.
//
// No portal:
//   // src/app/login/page.tsx  (server component)
//   export default async function Page({ searchParams }) {
//     return <TelaLogin marca={MARCA} aviso={avisoDoLogin(await searchParams)} />;
//   }
//
// `avisoDoLogin` vem de ./senha, não daqui: a página é do servidor, e função
// de arquivo "use client" não pode ser chamada de lá.
import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { erroSenhaNova, destinoSeguro } from "./senha";

export interface Marca {
  /** Nome do portal, para o título da aba e para quem não tem logo. */
  nome: string;
  /** O logo pronto (um <img>, um componente). Sem ele, o nome em texto. */
  logo?: ReactNode;
  /** Cor do botão e do foco. Padrão: a variável --brand do portal. */
  cor?: string;
  /** Linha pequena embaixo do cartão. */
  rodape?: string;
}

const cliente = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// ---- estilo ----------------------------------------------------------------
const S = {
  fundo: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", padding: 16, fontFamily: "inherit" } as CSSProperties,
  coluna: { width: "100%", maxWidth: 380 } as CSSProperties,
  topo: { textAlign: "center", marginBottom: 24 } as CSSProperties,
  nome: { fontSize: 22, fontWeight: 700, color: "#0f172a" } as CSSProperties,
  sub: { marginTop: 8, fontSize: 14, color: "#64748b" } as CSSProperties,
  cartao: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 1px 2px rgba(0,0,0,.05)", display: "flex", flexDirection: "column", gap: 14 } as CSSProperties,
  rotulo: { display: "block", fontSize: 13, fontWeight: 500, color: "#334155", marginBottom: 4 } as CSSProperties,
  campo: { display: "block", width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#0f172a", background: "#fff", outline: "none" } as CSSProperties,
  botao: (cor: string, ocupado: boolean): CSSProperties => ({ width: "100%", border: 0, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 600, color: "#fff", background: cor, cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }),
  link: { background: "none", border: 0, padding: 0, fontSize: 13, color: "#475569", textDecoration: "underline", cursor: "pointer", alignSelf: "center" } as CSSProperties,
  erro: { background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: 0 } as CSSProperties,
  ok: { background: "#ecfdf5", color: "#047857", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: 0 } as CSSProperties,
  aviso: { background: "#fffbeb", color: "#92400e", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "0 0 14px" } as CSSProperties,
  rodape: { marginTop: 16, textAlign: "center", fontSize: 12, color: "#94a3b8" } as CSSProperties,
};

function Moldura({ marca, subtitulo, aviso, children }: { marca: Marca; subtitulo: string; aviso?: string; children: ReactNode }) {
  return (
    <main style={S.fundo}>
      <div style={S.coluna}>
        <div style={S.topo}>
          {marca.logo ?? <div style={S.nome}>{marca.nome}</div>}
          <p style={S.sub}>{subtitulo}</p>
        </div>
        {aviso && <p style={S.aviso}>{aviso}</p>}
        {children}
        {marca.rodape && <p style={S.rodape}>{marca.rodape}</p>}
      </div>
    </main>
  );
}

function Campo(p: { rotulo: string; tipo: string; valor: string; muda: (v: string) => void; auto: string; foco?: boolean }) {
  return (
    <label style={{ display: "block" }}>
      <span style={S.rotulo}>{p.rotulo}</span>
      <input type={p.tipo} required autoComplete={p.auto} autoFocus={p.foco} value={p.valor}
        onChange={(e) => p.muda(e.target.value)} style={S.campo} />
    </label>
  );
}

// ---- entrar -----------------------------------------------------------------
export function TelaLogin({ marca, aviso, destino }: { marca: Marca; aviso?: string; destino?: string }) {
  const router = useRouter();
  const cor = marca.cor ?? "var(--brand, #0f172a)";
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setErro(null);
    const { error } = await cliente().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) { setOcupado(false); setErro("E-mail ou senha incorretos."); return; }
    router.push(destinoSeguro(destino));
    router.refresh();
  }

  async function pedirLink(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setErro(null); setOk(null);
    // Sem `?next=`: o /auth/callback já manda para /trocar-senha. A URL tem de
    // estar IGUAL na lista "Redirect URLs" do Supabase de cada portal.
    const { error } = await cliente().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setOcupado(false);
    // A resposta é a mesma exista ou não a conta: não dá para descobrir pela
    // tela quem tem acesso ao portal.
    if (error && /rate|limit|seconds/i.test(error.message)) setErro("Muitos pedidos seguidos. Espere um minuto e tente de novo.");
    else setOk("Se o e-mail tiver acesso, chega em instantes um link para criar a senha nova. Abra o link neste mesmo navegador.");
  }

  const trocar = (m: "entrar" | "esqueci") => { setModo(m); setErro(null); setOk(null); };

  return (
    <Moldura marca={marca} aviso={aviso} subtitulo={modo === "entrar" ? "Entre na sua conta" : "Esqueci minha senha"}>
      <form onSubmit={modo === "entrar" ? entrar : pedirLink} style={S.cartao}>
        <Campo rotulo="E-mail" tipo="email" valor={email} muda={setEmail} auto="email" foco />
        {modo === "entrar" && <Campo rotulo="Senha" tipo="password" valor={senha} muda={setSenha} auto="current-password" />}
        {erro && <p style={S.erro}>{erro}</p>}
        {ok && <p style={S.ok}>{ok}</p>}
        <button type="submit" disabled={ocupado} style={S.botao(cor, ocupado)}>
          {modo === "entrar" ? (ocupado ? "Entrando…" : "Entrar") : (ocupado ? "Enviando…" : "Enviar link")}
        </button>
        <button type="button" style={S.link} onClick={() => trocar(modo === "entrar" ? "esqueci" : "entrar")}>
          {modo === "entrar" ? "Esqueci minha senha" : "Voltar para o login"}
        </button>
      </form>
    </Moldura>
  );
}

// ---- trocar a senha ------------------------------------------------------------
/**
 * Serve para as duas entradas: quem chegou pelo link do e-mail (já logado pelo
 * /auth/callback) e quem entrou com a senha provisória. `rota` é para o portal
 * que guarda a marca de senha provisória no app_metadata: a troca passa pelo
 * servidor, porque só ele apaga a marca (POST { senha }). Sem `rota`, troca
 * direto pelo navegador.
 */
export function TelaTrocarSenha({ marca, rota, destino }: { marca: Marca; rota?: string; destino?: string }) {
  const router = useRouter();
  const cor = marca.cor ?? "var(--brand, #0f172a)";
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const problema = erroSenhaNova(senha, conf);
    if (problema) { setErro(problema); return; }
    setOcupado(true); setErro(null);
    const sb = cliente();
    let falha: string | null = null;
    if (rota) {
      const r = await fetch(rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      if (!r.ok) falha = ((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não foi possível trocar a senha.";
      // O token guarda o app_metadata da hora do login: renova para o proxy ver a marca apagada.
      else await sb.auth.refreshSession();
    } else {
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) falha = /different|same/i.test(error.message) ? "A senha nova tem de ser diferente da atual." : error.message;
    }
    if (falha) { setOcupado(false); setErro(falha); return; }
    router.push(destinoSeguro(destino));
    router.refresh();
  }

  return (
    <Moldura marca={marca} subtitulo="Crie a sua senha">
      <form onSubmit={salvar} style={S.cartao}>
        <Campo rotulo="Senha nova" tipo="password" valor={senha} muda={setSenha} auto="new-password" foco />
        <Campo rotulo="Repita a senha nova" tipo="password" valor={conf} muda={setConf} auto="new-password" />
        {erro && <p style={S.erro}>{erro}</p>}
        <button type="submit" disabled={ocupado} style={S.botao(cor, ocupado)}>
          {ocupado ? "Salvando…" : "Salvar e entrar"}
        </button>
      </form>
    </Moldura>
  );
}
