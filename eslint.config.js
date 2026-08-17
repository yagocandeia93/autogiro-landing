// Flat config — obrigatório a partir do ESLint 9, que não lê mais `.eslintrc`.
// O repositório nunca versionou um, então `npm run lint` falhava antes mesmo de
// olhar qualquer arquivo.
//
// `eslint-config-next` (15.5) ainda é publicado no formato antigo (eslintrc),
// então o FlatCompat traduz — é exatamente o que o `create-next-app` gera hoje.
// Quando o pacote passar a exportar flat config nativamente, isto vira um
// spread direto e o `@eslint/eslintrc` sai das devDependencies.

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // O HTML da landing é um bundle exportado (uma string JSON gigante com
      // fontes em base64 dentro) — ver docs/STATUS.md, seção 4.1. Não é código
      // escrito à mão e não faz sentido lintar.
      "public/index.html",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // O próprio flat config é CommonJS (o package.json não declara
    // `"type": "module"`), então o `require` acima é o formato correto aqui —
    // e não o erro que a regra de TypeScript enxerga.
    files: ["eslint.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
