module.exports = {
    env: {
        commonjs: true,
        es2021: true,
        node: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module'
    },
    rules: {
        indent: [
            'error',
            4
        ],
        quotes: [
            'error',
            'single'
        ],
        semi: [
            'error',
            'always'
        ],
        'quote-props': [
            'error',
            'as-needed'
        ]
    }
};
