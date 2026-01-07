import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
      "react/no-unescaped-entities": "warn"
    }
  },
  // TwoFactorAuthSetup uses data URLs for QR codes which next/image cannot handle
  // This is a documented limitation: https://nextjs.org/docs/api-reference/next/image#known-browser-bugs
  {
    files: ["**/TwoFactorAuthSetup.tsx"],
    rules: {
      "@next/next/no-img-element": "off"
    }
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "jest.config.js",
      "next.config.ts",
      "public/sw.js"
    ]
  }
];

export default eslintConfig;
