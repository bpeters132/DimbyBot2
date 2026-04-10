import path from "path"

/** @type {import("next").NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    experimental: {
        externalDir: true,
    },
    // Parity with bot `tsc` (NodeNext): `.js` specifiers resolve to `.ts` for webpack dev/build.
    // Turbopack does not apply this yet (see vercel/next.js#82945), so `package.json` dev uses webpack.
    webpack: (config) => {
        config.resolve.extensionAlias = {
            ".js": [".ts", ".tsx", ".js"],
            ".mjs": [".mts", ".mjs"],
            ".cjs": [".cts", ".cjs"],
        }
        return config
    },
    typescript: {
        tsconfigPath: "./tsconfig.json",
    },
    turbopack: {
        root: path.resolve(import.meta.dirname),
    },
    async rewrites() {
        const apiProxyTarget =
            process.env.API_PROXY_TARGET ||
            (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "")
        if (!apiProxyTarget) {
            return []
        }
        return [
            {
                source: "/api/guilds/:path*",
                destination: `${apiProxyTarget}/api/guilds/:path*`,
            },
        ]
    },
}

export default nextConfig
