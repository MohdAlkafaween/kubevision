import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import type { NextRequest } from "next/server";

const nextAuth = NextAuth(authOptions);

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  const params = await ctx.params;
  return nextAuth(req as unknown as Request, { params } as unknown as { params: Promise<{ nextauth: string[] }> });
}

export { handler as GET, handler as POST };
