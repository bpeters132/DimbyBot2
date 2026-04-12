import path from "path"

/** @type {import("next").NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    output: "standalone",
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "cdn.discordapp.com",
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
        config.resolve.extensionAlias = {
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
