import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ users: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { email, name, password, role } = await req.json();

    if (!email || !name || !password) {
      return NextResponse.json({ error: "Email, name, and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: role || "viewer" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    logAudit("create", user.email, `role=${user.role}`);

    return NextResponse.json({ user });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const userCount = await prisma.user.count();
    if (userCount <= 1) {
      return NextResponse.json({ error: "Cannot delete the last user" }, { status: 400 });
    }

    const deleted = await prisma.user.delete({ where: { id } });
    logAudit("delete", deleted.email, `role=${deleted.role}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
