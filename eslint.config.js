import js from "@eslint/js"
import globals from "globals"
import eslintConfigPrettier from "eslint-config-prettier/flat"

export default [
  {
    ignores: ["downloads/**", "logs/**", "node_modules/**", "storage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      semi: ["error", "never"],
    },
  },
  eslintConfigPrettier,
]
