import js from "@eslint/js"
import globals from "globals"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import tseslint from "typescript-eslint"

export default tseslint.config(
    {
        ignores: [
            "downloads/**",
            "logs/**",
            "node_modules/**",
            "storage/**",
            "dist/**",
            ".next/**",
            "src/web/.next/**",
        ],
    },
    js.configs.recommended,
    {
        files: ["**/*.{js,mjs,cjs}"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
        rules: {
            semi: ["error", "never"],
        },
    },
    {
        files: ["**/*.ts"],
        extends: [tseslint.configs.recommended],
        rules: {
            semi: ["error", "never"],
        },
    },
    eslintConfigPrettier
)
