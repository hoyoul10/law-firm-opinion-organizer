import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 기본 보안 헤더: 다른 사이트에 끼워 넣기 금지, 파일 종류 추측 금지, 주소 노출 최소화 (보안 점검 SEC-004)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // 추가 방어: 끼워 넣기·플러그인·다른 주소로 보내는 양식을 막고, 쓰지 않는 기기 권한을 끈다 (스크립트 제한은 Next.js 내부 스크립트 때문에 넣지 않음)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
