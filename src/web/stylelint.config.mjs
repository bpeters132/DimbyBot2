/** Tailwind v4 uses `@custom-variant` / `@theme`; keep Stylelint from flagging them as unknown SCSS at-rules. */
export default {
    customSyntax: "postcss-scss",
    plugins: ["stylelint-scss"],
    rules: {
        "scss/at-rule-no-unknown": [
            true,
            {
                ignoreAtRules: [
                    "custom-variant",
                    "theme",
                    "tailwind",
                    "apply",
                    "import",
                    "layer",
                    "screen",
                    "source",
                    "utility",
                    "variant",
                    "reference",
                ],
            },
        ],
    },
}
