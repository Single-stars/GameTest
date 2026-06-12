import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const homeworldScreenStub = join(projectRoot, "src/local-only/production-stubs/homeworld-screen.tsx");
const outdoorAdventureScreenStub = join(projectRoot, "src/local-only/production-stubs/outdoor-adventure-screen.tsx");
const homeworldStateStub = join(projectRoot, "src/local-only/production-stubs/homeworld-state.ts");
const outdoorAdventureEngineStub = join(projectRoot, "src/local-only/production-stubs/outdoor-adventure-engine.ts");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev, webpack }) => {
    if (!dev) {
      config.resolve ??= {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "@/features/homeworld/homeworld-screen": homeworldScreenStub,
        "@/features/homeworld/homeworld-screen$": homeworldScreenStub,
        "@/features/homeworld/homeworld-screen.tsx": homeworldScreenStub,
        "@/features/homeworld/homeworld-screen.tsx$": homeworldScreenStub,
        "@/features/outdoor-adventure/outdoor-adventure-screen": outdoorAdventureScreenStub,
        "@/features/outdoor-adventure/outdoor-adventure-screen$": outdoorAdventureScreenStub,
        "@/features/outdoor-adventure/outdoor-adventure-screen.tsx": outdoorAdventureScreenStub,
        "@/features/outdoor-adventure/outdoor-adventure-screen.tsx$": outdoorAdventureScreenStub,
        "@/lib/homeworld/homeworld-state": homeworldStateStub,
        "@/lib/homeworld/homeworld-state$": homeworldStateStub,
        "@/lib/homeworld/homeworld-state.ts": homeworldStateStub,
        "@/lib/homeworld/homeworld-state.ts$": homeworldStateStub,
        "@/lib/outdoor-adventure/engine": outdoorAdventureEngineStub,
        "@/lib/outdoor-adventure/engine$": outdoorAdventureEngineStub,
        "@/lib/outdoor-adventure/engine.ts": outdoorAdventureEngineStub,
        "@/lib/outdoor-adventure/engine.ts$": outdoorAdventureEngineStub,
        "../homeworld/homeworld-state": homeworldStateStub,
        "../homeworld/homeworld-state$": homeworldStateStub,
        "../homeworld/homeworld-state.ts": homeworldStateStub,
        "../homeworld/homeworld-state.ts$": homeworldStateStub,
      };
      config.plugins ??= [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^@\/features\/homeworld\/homeworld-screen(?:\.tsx)?$/, homeworldScreenStub),
        new webpack.NormalModuleReplacementPlugin(/^@\/features\/outdoor-adventure\/outdoor-adventure-screen(?:\.tsx)?$/, outdoorAdventureScreenStub),
        new webpack.NormalModuleReplacementPlugin(/^@\/lib\/homeworld\/homeworld-state(?:\.ts)?$/, homeworldStateStub),
        new webpack.NormalModuleReplacementPlugin(/^@\/lib\/outdoor-adventure\/engine(?:\.ts)?$/, outdoorAdventureEngineStub),
        new webpack.NormalModuleReplacementPlugin(/^\.\.\/homeworld\/homeworld-state(?:\.ts)?$/, homeworldStateStub),
      );
    }
    return config;
  },
};

export default nextConfig;
