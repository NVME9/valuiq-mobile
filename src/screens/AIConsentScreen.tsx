import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";

interface Props { onAgree: () => void; }

export default function AIConsentScreen({ onAgree }: Props) {
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={s.title}>How ValuIQ Analyzes Your Items</Text>
        <Text style={s.body}>
          To identify your items and estimate their resale value, ValuIQ sends the photos you scan and any
          details you enter to trusted third-party AI services.
        </Text>

        <View style={s.card}>
          <Text style={s.cardLabel}>What we send</Text>
          <Text style={s.cardText}>The photos you take or upload, plus any item details you type (brand, model, condition, etc.).</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>Who it's sent to</Text>
          <Text style={s.cardText}>Anthropic (Claude) and Groq — AI providers that analyze the image and details to identify the item and estimate its value. We also query eBay for current listing prices.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>What we don't do</Text>
          <Text style={s.cardText}>We don't sell your personal data. Photos and details are sent only to provide your appraisal. See our Privacy Policy for full details.</Text>
        </View>

        <Text style={s.note}>
          By tapping "I Agree," you consent to ValuIQ sending your scan photos and details to these AI services to analyze your items.
        </Text>

        <TouchableOpacity style={s.agreeBtn} onPress={onAgree} activeOpacity={0.85}>
          <Text style={s.agreeTxt}>I Agree</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  title:     { color: C.text1, fontSize: 24, fontWeight: "900", marginBottom: 14, marginTop: 12 },
  body:      { color: C.text2, fontSize: 15, lineHeight: 22, marginBottom: 20 },
  card:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardLabel: { color: C.green, fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },
  cardText:  { color: C.text2, fontSize: 14, lineHeight: 21 },
  note:      { color: C.text4, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 20, textAlign: "center" },
  agreeBtn:  { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  agreeTxt:  { color: "#0a1500", fontSize: 16, fontWeight: "900" },
});
