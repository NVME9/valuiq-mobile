// SaleCapturePrompt.tsx — the in-app moat capture (workhorse channel).
// On dashboard load, fetches aging BUY scans needing an outcome and shows ONE card at a time.
// Renders nothing when there's nothing to ask. Non-intrusive, advances as the user answers.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { getPendingSaleScans, PendingScan } from "../lib/saleCapture";

interface Props {
  token: string;
  maxPerSession?: number;   // cap how many we ask per app session (default 3)
}

export default function SaleCapturePrompt({ token, maxPerSession = 3 }: Props) {
  const [queue, setQueue] = useState<PendingScan[]>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setLoaded(true); return; }
      const pending = await getPendingSaleScans(token, 4, maxPerSession);
      if (alive) {
        setQueue(pending);
        setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  if (!loaded || queue.length === 0 || index >= queue.length) return null;

  const current = queue[index];

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Quick check-in</Text>
        <Text style={s.headerSub}>
          Help us sharpen your data{queue.length > 1 ? `  ·  ${index + 1} of ${queue.length}` : ""}
        </Text>
      </View>
      <SaleCaptureCard
        token={token}
        scan={current}
        channel="in_app"
        onDone={() => setIndex((i) => i + 1)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 12 },
  header: { marginBottom: 4, paddingHorizontal: 4 },
  headerTitle: { color: C.green, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  headerSub: { color: C.text4, fontSize: 12, marginTop: 2 },
});
