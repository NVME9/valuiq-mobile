export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { lensResult, battleResult } = await req.json();
    if (!lensResult || !battleResult) return NextResponse.json({ consistent: true });
    const lensSell = Number(lensResult.sellPrice) || 0;
    const battleSell = Number(battleResult.platforms?.[0]?.sellPrice) || 0;
    const variance = lensSell > 0 ? Math.abs(lensSell - battleSell) / lensSell : 0;
    return NextResponse.json({
      consistent: variance <= 0.25,
      variance: Math.round(variance * 100),
      lensPrice: lensSell,
      battlePrice: battleSell,
      note: variance <= 0.25 ? "Results aligned ✓" : `${Math.round(variance*100)}% variance — Price Battle has fuller breakdown`,
    });
  } catch { return NextResponse.json({ consistent: true }); }
}
