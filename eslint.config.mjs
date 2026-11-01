import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**", "out/**", "build/**", "next-env.d.ts",
    // Assets de terceiros: public/pdf.worker.min.mjs é o worker MINIFICADO do
    // pdf.js — sozinho rendia ~1.600 avisos e 6 erros que não dá para corrigir.
    "public/**",
  ]),
]);

export default eslintConfig;
