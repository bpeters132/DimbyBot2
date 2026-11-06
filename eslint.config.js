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
            "src/**/*.test.ts",
            "tests/**/*.test.ts",
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
        files: ["**/*.{ts,tsx}"],
        extends: [tseslint.configs.recommended],
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["prisma.config.ts"],
                    defaultProject: "tsconfig.eslint.json",
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            semi: ["error", "never"],
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            // Descriptions only. ts-nocheck stays banned (it is a file-wide waiver).
            "@typescript-eslint/ban-ts-comment": [
                "error",
                {
                    "ts-expect-error": "allow-with-description",
                    "ts-ignore": "allow-with-description",
                    "ts-nocheck": true,
                    "ts-check": false,
                    minimumDescriptionLength: 10,
                },
            ],
        },
    },
    eslintConfigPrettier
)
