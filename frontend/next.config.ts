import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    transpilePackages: ["@heroui/react", "@heroui/theme"],
};

export default nextConfig;
