import path from "path"

/** Security headers applied to all dashboard routes (anti-clickjacking + baseline hardening). */
const securityHeaders = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
]

/** @type {import("next").NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: "standalone",
    async headers() {
        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ]
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "cdn.discordapp.com",
                pathname: "/**",
            },
            {
                protocol: "https",
                hostname: "images.discordapp.net",
                pathname: "/**",
            },
        ],
    },
    experimental: {
        externalDir: true,
    },
    // Parity with bot `tsc` (NodeNext): `.js` specifiers resolve to `.ts` for webpack dev/build.
    // Turbopack does not apply this yet (see vercel/next.js#82945), so `package.json` dev uses webpack.
    webpack: (config) => {
        const existingExtensionAlias = config.resolve.extensionAlias ?? {}
        config.resolve.extensionAlias = {
            ...existingExtensionAlias,
            ".js": [".ts", ".tsx", ".js"],
            ".mjs": [".mts", ".mjs"],
            ".cjs": [".cts", ".cjs"],
        }
        config.resolve.alias = {
            ...(config.resolve.alias ?? {}),
            "zlib-sync": false,
        }
        return config
    },
    typescript: {
        tsconfigPath: "./tsconfig.json",
    },
    turbopack: {
        root: path.resolve(import.meta.dirname),
    },
}

export default nextConfig
