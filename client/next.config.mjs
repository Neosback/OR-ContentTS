/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          // Dev only: lets the JS Self-Profiling API (new Profiler()) sample the editor.
          ...(process.env.NODE_ENV === "production"
            ? []
            : [{ key: "Document-Policy", value: "js-profiling" }]),
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/caches/:path*",
        destination: "/api/caches/:path*",
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Browser/WASM-only: never webpack-bundle this into server output (it produced a
    // missing ./vendor-chunks/@foxglove.js). The server requires it natively from
    // node_modules instead; nothing server-side executes it (map page is ssr:false,
    // Bzip2 falls back to pure JS until initWasm runs in the browser/worker).
    serverComponentsExternalPackages: ["@foxglove/wasm-bz2"],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(glsl|vert|frag|vs|fs)$/,
      use: ["ts-shader-loader"],
    });

    config.module.rules.push({
      resourceQuery: /source/,
      type: "asset/source",
    });

    config.module.rules.push({
      resourceQuery: /url/,
      type: "asset/resource",
    });

    // @foxglove/wasm-bz2's emscripten loader does `require("./module.wasm")` and expects the
    // bundler to return the file's URL (for the main thread and the render workers alike).
    config.module.rules.push({
      test: /\.wasm$/,
      include: /@foxglove[\\/]wasm-bz2/,
      type: "asset/resource",
    });

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config;
  },
};

export default nextConfig;
